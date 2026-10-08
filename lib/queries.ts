/**
 * Dashboard reads. All money arithmetic happens in SQL on DECIMAL columns —
 * never in JS floats, where 0.1 + 0.2 problems quietly corrupt a spend total.
 */
import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adAccounts, adSpend, campaignBudgets } from "@/lib/db/schema";
import { earliestSyncedDay, yesterdayIn } from "@/lib/sync";

export type CampaignRow = {
  campaignId: string;
  campaignName: string;
  accountName: string;
  platform: string;
  /** Platform status: Meta's ACTIVE/PAUSED, Google's ENABLED/PAUSED/REMOVED. */
  status: string | null;
  spend: number;
  clicks: number;
  leads: number;
  impressions: number;
  dailyBudget: number | null;
  /** leads ÷ clicks × 100. Null when there were no clicks to divide by. */
  conversionRate: number | null;
  /** spend ÷ leads. Null when there were no leads — never shown as ₹0. */
  costPerLead: number | null;
};

export type DashboardData = {
  rows: CampaignRow[];
  totals: { spend: number; clicks: number; leads: number; campaigns: number };
  currencies: string[];
  /** Platforms with a connected account — drives the page title and the source note. */
  platforms: string[];
  lastSyncedAt: Date | null;
  /**
   * Oldest day held locally. A range starting before this silently understates
   * the total — the exact bug that makes a dashboard untrustworthy — so the
   * page warns instead of quietly showing a smaller number.
   */
  earliestDay: string | null;
};

export async function getAccounts() {
  return db.select().from(adAccounts).orderBy(adAccounts.name);
}

/** The default view: the latest complete day in the ad account's own timezone. */
export async function defaultDay(): Promise<string> {
  const [acct] = await db.select().from(adAccounts).limit(1);
  return yesterdayIn(acct?.timezone || "Asia/Kolkata");
}

export async function getDashboard(
  since: string,
  until: string,
  accountId?: number,
  query?: string
): Promise<DashboardData> {
  const where = [gte(adSpend.day, since), lte(adSpend.day, until)];
  if (accountId) where.push(eq(adSpend.adAccountId, accountId));
  // Substring match on the campaign name: searching "trident" should surface
  // every Trident campaign regardless of city or suffix. Filtering in SQL (not
  // on the rendered rows) means the totals reflect the search too.
  if (query?.trim()) where.push(like(adSpend.campaignName, `%${query.trim()}%`));

  const grouped = await db
    .select({
      campaignId: adSpend.campaignId,
      // A campaign can be renamed mid-range; show the most recent name.
      campaignName: sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${adSpend.campaignName} ORDER BY ${adSpend.day} DESC), ',', 1)`,
      accountName: adAccounts.name,
      accountId: adAccounts.id,
      platform: adAccounts.platform,
      spend: sql<string>`SUM(${adSpend.spend})`,
      clicks: sql<number>`SUM(${adSpend.clicks})`,
      leads: sql<number>`SUM(${adSpend.leads})`,
      impressions: sql<number>`SUM(${adSpend.impressions})`,
    })
    .from(adSpend)
    .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
    .where(and(...where))
    .groupBy(adSpend.campaignId, adAccounts.name, adAccounts.id, adAccounts.platform)
    .orderBy(desc(sql`SUM(${adSpend.spend})`));

  const budgets = await db.select().from(campaignBudgets);
  const budgetByKey = new Map(
    budgets.map((b) => [`${b.adAccountId}:${b.campaignId}`, b])
  );

  const rows: CampaignRow[] = grouped.map((g) => {
    const spend = Number(g.spend ?? 0);
    const clicks = Number(g.clicks ?? 0);
    const leads = Number(g.leads ?? 0);
    const meta = budgetByKey.get(`${g.accountId}:${g.campaignId}`);
    const budget = meta?.dailyBudget ?? null;
    return {
      campaignId: g.campaignId,
      campaignName: g.campaignName,
      accountName: g.accountName,
      platform: g.platform,
      status: meta?.status ?? null,
      spend,
      clicks,
      leads,
      impressions: Number(g.impressions ?? 0),
      dailyBudget: budget ? Number(budget) : null,
      conversionRate: clicks > 0 ? (leads / clicks) * 100 : null,
      costPerLead: leads > 0 ? spend / leads : null,
    };
  });

  const [accounts, earliestDay] = await Promise.all([getAccounts(), earliestSyncedDay()]);

  return {
    rows,
    earliestDay,
    totals: {
      spend: rows.reduce((n, r) => n + r.spend, 0),
      clicks: rows.reduce((n, r) => n + r.clicks, 0),
      leads: rows.reduce((n, r) => n + r.leads, 0),
      campaigns: rows.length,
    },
    // Totals are only meaningful when every account shares one currency.
    currencies: [...new Set(accounts.map((a) => a.currency))],
    platforms: [...new Set(accounts.map((a) => a.platform))].sort(),
    lastSyncedAt: accounts.reduce<Date | null>(
      (latest, a) => (a.lastSyncedAt && (!latest || a.lastSyncedAt > latest) ? a.lastSyncedAt : latest),
      null
    ),
  };
}

export type DailyPoint = { day: string; spend: number; leads: number; clicks: number };

/**
 * Per-day totals for the time-series charts. Aggregated in SQL so the chart
 * receives exactly the points it draws, rather than every campaign-day row.
 */
export async function getDailySeries(
  since: string,
  until: string,
  accountId?: number,
  query?: string
): Promise<DailyPoint[]> {
  const where = [gte(adSpend.day, since), lte(adSpend.day, until)];
  if (accountId) where.push(eq(adSpend.adAccountId, accountId));
  if (query?.trim()) where.push(like(adSpend.campaignName, `%${query.trim()}%`));

  const rows = await db
    .select({
      day: adSpend.day,
      spend: sql<string>`SUM(${adSpend.spend})`,
      leads: sql<number>`SUM(${adSpend.leads})`,
      clicks: sql<number>`SUM(${adSpend.clicks})`,
    })
    .from(adSpend)
    .where(and(...where))
    .groupBy(adSpend.day)
    .orderBy(adSpend.day);

  return rows.map((r) => ({
    day: r.day,
    spend: Number(r.spend ?? 0),
    leads: Number(r.leads ?? 0),
    clicks: Number(r.clicks ?? 0),
  }));
}

export type PlatformTotal = {
  platform: string;
  spend: number;
  leads: number;
  clicks: number;
  campaigns: number;
};

/** Spend split by platform — the "how much on Meta vs Google" question. */
export async function getPlatformTotals(
  since: string,
  until: string,
  accountId?: number,
  query?: string
): Promise<PlatformTotal[]> {
  const where = [gte(adSpend.day, since), lte(adSpend.day, until)];
  if (accountId) where.push(eq(adSpend.adAccountId, accountId));
  if (query?.trim()) where.push(like(adSpend.campaignName, `%${query.trim()}%`));

  const rows = await db
    .select({
      platform: adAccounts.platform,
      spend: sql<string>`SUM(${adSpend.spend})`,
      leads: sql<number>`SUM(${adSpend.leads})`,
      clicks: sql<number>`SUM(${adSpend.clicks})`,
      campaigns: sql<number>`COUNT(DISTINCT ${adSpend.campaignId})`,
    })
    .from(adSpend)
    .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
    .where(and(...where))
    .groupBy(adAccounts.platform)
    .orderBy(desc(sql`SUM(${adSpend.spend})`));

  return rows.map((r) => ({
    platform: r.platform,
    spend: Number(r.spend ?? 0),
    leads: Number(r.leads ?? 0),
    clicks: Number(r.clicks ?? 0),
    campaigns: Number(r.campaigns ?? 0),
  }));
}

export type DailyByPlatform = { day: string; META: number; GOOGLE: number };

/**
 * Daily spend split by platform, pivoted so one row is one day with a column
 * per platform — the shape a stacked bar chart wants.
 */
export async function getDailyByPlatform(
  since: string,
  until: string,
  accountId?: number,
  query?: string
): Promise<DailyByPlatform[]> {
  const where = [gte(adSpend.day, since), lte(adSpend.day, until)];
  if (accountId) where.push(eq(adSpend.adAccountId, accountId));
  if (query?.trim()) where.push(like(adSpend.campaignName, `%${query.trim()}%`));

  const rows = await db
    .select({
      day: adSpend.day,
      platform: adAccounts.platform,
      spend: sql<string>`SUM(${adSpend.spend})`,
    })
    .from(adSpend)
    .innerJoin(adAccounts, eq(adAccounts.id, adSpend.adAccountId))
    .where(and(...where))
    .groupBy(adSpend.day, adAccounts.platform)
    .orderBy(adSpend.day);

  const byDay = new Map<string, DailyByPlatform>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { day: r.day, META: 0, GOOGLE: 0 };
    if (r.platform === "GOOGLE") d.GOOGLE = Number(r.spend ?? 0);
    else d.META = Number(r.spend ?? 0);
    byDay.set(r.day, d);
  }
  return [...byDay.values()];
}
