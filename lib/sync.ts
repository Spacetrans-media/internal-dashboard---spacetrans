/**
 * Pulls Meta numbers into the database.
 *
 * Always re-pulls a trailing window rather than just yesterday: Meta keeps
 * adjusting recent figures for a few days as attribution settles, so a
 * fetch-once-and-trust approach silently drifts away from Ads Manager. The
 * unique key on (account, campaign, day) makes the re-pull a no-op overwrite.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adAccounts, adSpend, campaignBudgets, syncRuns } from "@/lib/db/schema";
import { getCampaignBudgets, getDailyCampaignInsights } from "@/lib/meta/client";
import {
  getCampaignBudgets as getGoogleBudgets,
  getDailyCampaignMetrics,
} from "@/lib/google/client";

/** How many days back each run re-reads. Meta restatements land within ~3 days. */
export const SYNC_WINDOW_DAYS = 7;

/** Today's date in a given IANA timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * The dashboard never shows today, by design — the client agreed N-1, and
 * Meta's current-day figures are estimates that move all day.
 */
export function yesterdayIn(timeZone: string): string {
  return addDays(todayIn(timeZone), -1);
}

export type SyncResult = { accountId: string; rows: number; error?: string };

/**
 * Sync one ad account over an explicit date range. Never throws: failures are
 * recorded against the account and returned.
 *
 * Meta's campaign-level insights include paused and archived campaigns that
 * spent in the window — verified against account-level totals, which matched to
 * the paisa — so nothing needs filtering in or out here.
 */
export async function syncRange(
  account: typeof adAccounts.$inferSelect,
  since: string,
  until: string,
  trigger: "cron" | "manual" | "backfill"
): Promise<SyncResult> {
  const startedAt = new Date();

  try {
    const rows =
      account.platform === "GOOGLE"
        ? (await getDailyCampaignMetrics(account.accountId, since, until)).map((r) => ({
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            day: r.day,
            spend: r.spend,
            clicks: r.clicks,
            impressions: r.impressions,
            leads: r.leads,
          }))
        : await getDailyCampaignInsights(account.accountId, since, until);

    if (rows.length) {
      // One multi-row upsert; MariaDB caps placeholders, so chunk it.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await db
          .insert(adSpend)
          .values(
            chunk.map((r) => ({
              adAccountId: account.id,
              campaignId: r.campaignId,
              campaignName: r.campaignName,
              day: r.day,
              spend: r.spend,
              clicks: r.clicks,
              impressions: r.impressions,
              leads: r.leads,
            }))
          )
          .onDuplicateKeyUpdate({
            set: {
              campaignName: sql`VALUES(campaign_name)`,
              spend: sql`VALUES(spend)`,
              clicks: sql`VALUES(clicks)`,
              impressions: sql`VALUES(impressions)`,
              leads: sql`VALUES(leads)`,
              syncedAt: sql`CURRENT_TIMESTAMP`,
            },
          });
      }
    }

    // Budgets are a current setting, not history — refreshed, never accumulated.
    const budgets =
      account.platform === "GOOGLE"
        ? (await getGoogleBudgets(account.accountId)).map((b) => ({
            campaignId: b.campaignId,
            dailyBudget: b.dailyBudget,
            // Google has no campaign-vs-adset budget split, so the value always
            // comes from the campaign itself.
            source: "campaign" as const,
            status: b.status,
          }))
        : await getCampaignBudgets(account.accountId);
    for (let i = 0; i < budgets.length; i += 200) {
      const chunk = budgets.slice(i, i + 200);
      if (!chunk.length) continue;
      await db
        .insert(campaignBudgets)
        .values(
          chunk.map((b) => ({
            adAccountId: account.id,
            campaignId: b.campaignId,
            dailyBudget: b.dailyBudget,
            source: b.source,
            status: b.status,
          }))
        )
        .onDuplicateKeyUpdate({
          set: {
            dailyBudget: sql`VALUES(daily_budget)`,
            source: sql`VALUES(source)`,
            status: sql`VALUES(status)`,
          },
        });
    }

    await db
      .update(adAccounts)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(adAccounts.id, account.id));

    await db.insert(syncRuns).values({
      adAccountId: account.id,
      trigger,
      status: "OK",
      rowsWritten: rows.length,
      startedAt,
      finishedAt: new Date(),
    });

    return { accountId: account.accountId, rows: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(adAccounts)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(adAccounts.id, account.id));

    await db.insert(syncRuns).values({
      adAccountId: account.id,
      trigger,
      status: "ERROR",
      message: message.slice(0, 500),
      startedAt,
      finishedAt: new Date(),
    });

    return { accountId: account.accountId, rows: 0, error: message };
  }
}

/** The nightly job: re-read the trailing window to absorb Meta's restatements. */
export async function syncAccount(
  account: typeof adAccounts.$inferSelect,
  trigger: "cron" | "manual"
): Promise<SyncResult> {
  const until = yesterdayIn(account.timezone);
  const since = addDays(until, -(SYNC_WINDOW_DAYS - 1));
  return syncRange(account, since, until, trigger);
}

/**
 * Backfill history, one calendar month per request.
 *
 * Meta will happily accept a year-long `time_range` with `time_increment=1`,
 * but the paged response gets unwieldy and a single failure loses the lot.
 * Month-sized chunks keep each call small and make a partial failure cheap to
 * retry, since the upsert is idempotent.
 */
export async function backfillAccount(
  account: typeof adAccounts.$inferSelect,
  monthsBack: number
): Promise<SyncResult> {
  const today = todayIn(account.timezone);
  let rows = 0;
  const errors: string[] = [];

  for (let m = monthsBack; m >= 0; m--) {
    const anchor = new Date(`${today}T00:00:00Z`);
    anchor.setUTCDate(1);
    anchor.setUTCMonth(anchor.getUTCMonth() - m);

    const since = anchor.toISOString().slice(0, 10);
    const end = new Date(anchor);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0); // last day of `anchor`'s month

    // Never ask for today or later; Meta only estimates the current day.
    const yesterday = yesterdayIn(account.timezone);
    const until = end.toISOString().slice(0, 10) > yesterday
      ? yesterday
      : end.toISOString().slice(0, 10);

    if (since > until) continue;

    const res = await syncRange(account, since, until, "backfill");
    rows += res.rows;
    if (res.error) errors.push(`${since}: ${res.error}`);
  }

  return {
    accountId: account.accountId,
    rows,
    error: errors.length ? errors.join(" | ") : undefined,
  };
}

/** Sync every active account, any platform. One bad account never blocks the others. */
export async function syncAllAccounts(
  trigger: "cron" | "manual",
  monthsBack = 0
): Promise<SyncResult[]> {
  const accounts = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.isActive, 1));

  const results: SyncResult[] = [];
  for (const account of accounts) {
    results.push(
      monthsBack > 0
        ? await backfillAccount(account, monthsBack)
        : await syncAccount(account, trigger)
    );
  }
  return results;
}

/** Earliest day we hold data for — the dashboard warns below this. */
export async function earliestSyncedDay(): Promise<string | null> {
  const [row] = await db
    .select({ day: sql<string>`MIN(${adSpend.day})` })
    .from(adSpend);
  return row?.day ?? null;
}
