/**
 * Meta Marketing API client.
 *
 * Authenticated with a Business Manager System User token (`ads_read`), which
 * does not expire — so there is no OAuth flow and nothing to reconnect.
 * The token is read from env and must never be logged or returned to the browser.
 */
const V = process.env.META_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${V}`;

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN is not set");
  return t;
}

/** Meta errors arrive as 200-with-error or 4xx-with-body; normalise both. */
async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token());

  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.error) {
    const e = body?.error;
    // Surface Meta's own message; it is far more useful than the status text.
    throw new Error(
      `Meta API ${e?.code ?? res.status}${e?.error_subcode ? `/${e.error_subcode}` : ""}: ${
        e?.message || res.statusText
      }`
    );
  }
  return body as T;
}

/** Follow `paging.next` until exhausted. Insights pages at 25 rows by default. */
async function graphAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<{ data: T[]; paging?: { next?: string } }>(path, {
    ...params,
    limit: "500",
  });
  out.push(...(page.data || []));

  let next = page.paging?.next;
  let guard = 0;
  while (next && guard++ < 50) {
    const res = await fetch(next, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) break;
    out.push(...(body.data || []));
    next = body.paging?.next;
  }
  return out;
}

export type MetaAdAccount = {
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
};

/** Every ad account the System User token can read. Used once, in setup. */
export async function listAdAccounts(): Promise<MetaAdAccount[]> {
  return graphAll<MetaAdAccount>("me/adaccounts", {
    fields: "account_id,name,currency,timezone_name,account_status",
  });
}

type InsightRow = {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  actions?: { action_type: string; value: string }[];
};

export type DailyCampaignRow = {
  campaignId: string;
  campaignName: string;
  day: string;
  spend: string;
  clicks: number;
  impressions: number;
  leads: number;
};

/**
 * Meta counts a lead ad submission under one of several action types depending
 * on where the form lives. Summing all of them double-counts, so we take the
 * first that is present, in order of specificity.
 */
const LEAD_ACTION_TYPES = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "leadgen_grouped",
];

function leadsFrom(actions?: { action_type: string; value: string }[]): number {
  if (!actions?.length) return 0;
  for (const type of LEAD_ACTION_TYPES) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

/**
 * Daily per-campaign numbers for a date range, in the ad account's own
 * timezone. `time_increment=1` gives one row per campaign per day.
 */
export async function getDailyCampaignInsights(
  accountId: string,
  since: string,
  until: string
): Promise<DailyCampaignRow[]> {
  const rows = await graphAll<InsightRow>(`act_${accountId}/insights`, {
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,campaign_name,spend,clicks,impressions,actions",
  });

  return rows.map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    day: r.date_start,
    spend: r.spend ?? "0",
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
    leads: leadsFrom(r.actions),
  }));
}

export type CampaignBudget = {
  campaignId: string;
  dailyBudget: string | null;
  source: "campaign" | "adsets";
  status: string | null;
};

/** Meta returns money in MINOR units here (paise), unlike insights. */
function minorToMajor(v?: string | null): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : null;
}

/**
 * Current daily budget per campaign.
 *
 * With Campaign Budget Optimisation ON the budget sits on the campaign. With it
 * OFF the campaign field is empty and the real budget lives on the ad sets, so
 * we sum the active ad sets instead. Without this fallback the column is blank
 * for most accounts.
 */
export async function getCampaignBudgets(accountId: string): Promise<CampaignBudget[]> {
  const campaigns = await graphAll<{
    id: string;
    daily_budget?: string;
    effective_status?: string;
  }>(`act_${accountId}/campaigns`, {
    fields: "id,daily_budget,effective_status",
  });

  const out: CampaignBudget[] = [];
  const needsAdsets: string[] = [];

  for (const c of campaigns) {
    const own = minorToMajor(c.daily_budget);
    if (own) {
      out.push({ campaignId: c.id, dailyBudget: own, source: "campaign", status: c.effective_status ?? null });
    } else {
      needsAdsets.push(c.id);
      out.push({ campaignId: c.id, dailyBudget: null, source: "adsets", status: c.effective_status ?? null });
    }
  }

  if (!needsAdsets.length) return out;

  const adsets = await graphAll<{
    campaign_id: string;
    daily_budget?: string;
    effective_status?: string;
  }>(`act_${accountId}/adsets`, {
    fields: "campaign_id,daily_budget,effective_status",
  });

  const summed = new Map<string, number>();
  for (const a of adsets) {
    // A paused ad set spends nothing, so counting it would overstate the budget.
    if (a.effective_status && a.effective_status !== "ACTIVE") continue;
    const major = minorToMajor(a.daily_budget);
    if (!major) continue;
    summed.set(a.campaign_id, (summed.get(a.campaign_id) ?? 0) + Number(major));
  }

  for (const row of out) {
    if (row.source !== "adsets") continue;
    const total = summed.get(row.campaignId);
    row.dailyBudget = total ? total.toFixed(2) : null;
  }

  return out;
}
