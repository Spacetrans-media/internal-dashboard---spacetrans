/**
 * Google Ads API client.
 *
 * Authenticated with a service-account JSON key — Google's equivalent of Meta's
 * System User token. No OAuth consent screen, no refresh token, nothing that
 * expires after seven days.
 *
 * Developer tokens are deliberately absent: they were sunset on 9 September 2026
 * and are ignored by the API servers. Access level is a property of the Cloud
 * project that owns the service account, not of a token we send.
 *
 * Mirrors `lib/meta/client.ts` in shape so the two sync paths read alike.
 */
import { SignJWT, importPKCS8 } from "jose";

const V = process.env.GOOGLE_ADS_API_VERSION || "v25";
const BASE = `https://googleads.googleapis.com/${V}`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

function serviceAccount(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  try {
    return JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

// Access tokens last an hour. Caching one in module scope keeps a backfill of
// ~14 sequential month-queries down to a single token exchange.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const sa = serviceAccount();
  // JSON escapes newlines in the PEM; restore them or the import fails.
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: sa.private_key_id })
    .setIssuer(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Google token exchange failed: ${body.error_description || body.error || res.statusText}`
    );
  }

  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

function headers(token: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // Required when reading a client account through a manager account. Digits
  // only — hyphens in the customer id are a common silent 401.
  const mcc = process.env.GOOGLE_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (mcc) h["login-customer-id"] = mcc;
  return h;
}

/**
 * Run a GAQL query. `searchStream` returns an ARRAY of chunks, each holding its
 * own `results` — not a single object — so the chunks are flattened here.
 */
async function search<T>(customerId: string, query: string): Promise<T[]> {
  const token = await accessToken();
  const id = customerId.replace(/-/g, "");

  const res = await fetch(`${BASE}/customers/${id}/googleAds:searchStream`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    const detail = err?.details?.[0]?.errors?.[0];
    throw new Error(
      `Google Ads API ${res.status}: ${detail?.message || err?.message || res.statusText}`
    );
  }

  const chunks = Array.isArray(body) ? body : [body];
  return chunks.flatMap((c) => (c?.results ?? []) as T[]);
}

export type GoogleCustomer = {
  customerId: string;
  name: string;
  currency: string;
  timezone: string;
};

/**
 * Every non-manager account under the MCC.
 *
 * `customers:listAccessibleCustomers` returns only accounts the service account
 * is DIRECTLY linked to — for a manager link that is just the MCC itself, not
 * its children. Querying `customer_client` from the manager is what actually
 * enumerates the accounts.
 *
 * Managers and closed accounts are filtered out: neither carries spend.
 */
export async function listManagedCustomers(): Promise<GoogleCustomer[]> {
  const mcc = process.env.GOOGLE_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  if (!mcc) throw new Error("GOOGLE_LOGIN_CUSTOMER_ID is not set");

  const rows = await search<{
    customerClient: {
      id: string;
      descriptiveName?: string;
      currencyCode: string;
      timeZone: string;
      manager: boolean;
      status: string;
    };
  }>(
    mcc,
    `SELECT customer_client.id, customer_client.descriptive_name,
            customer_client.currency_code, customer_client.time_zone,
            customer_client.manager, customer_client.status
     FROM customer_client
     WHERE customer_client.level <= 2`
  );

  return rows
    .map((r) => r.customerClient)
    .filter((c) => !c.manager && c.status === "ENABLED")
    .map((c) => ({
      customerId: c.id,
      name: c.descriptiveName || `Account ${c.id}`,
      currency: c.currencyCode,
      timezone: c.timeZone,
    }));
}

export type GoogleDailyRow = {
  campaignId: string;
  campaignName: string;
  day: string;
  spend: string;
  clicks: number;
  impressions: number;
  leads: number;
};

/**
 * Conversion categories that count as a lead.
 *
 * Mirrors how Google Ads' own UI groups "Leads", so our number matches what the
 * PPC team sees on their screen — the thing that makes a dashboard trusted.
 * Purchases, page views and engagement are deliberately excluded.
 */
const LEAD_CATEGORIES = new Set([
  "LEAD",
  "SUBMIT_LEAD_FORM",
  "PHONE_CALL_LEAD",
  "IMPORTED_LEAD",
  "QUALIFIED_LEAD",
  "CONVERTED_LEAD",
  "BOOK_APPOINTMENT",
  "REQUEST_QUOTE",
  "CONTACT",
  "SIGNUP",
]);

/**
 * Daily per-campaign metrics, assembled from TWO queries.
 *
 * Cost and conversion-category cannot be selected together: the API rejects it
 * with a 400 rather than repeating spend across category rows, which is exactly
 * the double-count it would otherwise cause. So spend comes from an unsegmented
 * query (verified to match the account-level total to the paisa) and leads come
 * from a segmented one, joined on campaign and date.
 *
 * `segments.date` is in the account's own timezone, matching Meta.
 */
export async function getDailyCampaignMetrics(
  customerId: string,
  since: string,
  until: string
): Promise<GoogleDailyRow[]> {
  const window = `WHERE segments.date BETWEEN '${since}' AND '${until}'`;

  const spendRows = await search<{
    campaign: { id: string; name: string };
    segments: { date: string };
    metrics: { costMicros?: string; clicks?: string; impressions?: string };
  }>(
    customerId,
    `SELECT campaign.id, campaign.name, segments.date,
            metrics.cost_micros, metrics.clicks, metrics.impressions
     FROM campaign ${window}`
  );

  const leadRows = await search<{
    campaign: { id: string };
    segments: { date: string; conversionActionCategory?: string };
    metrics: { conversions?: number };
  }>(
    customerId,
    `SELECT campaign.id, segments.date, segments.conversion_action_category,
            metrics.conversions
     FROM campaign ${window}`
  );

  const leadsByKey = new Map<string, number>();
  for (const r of leadRows) {
    if (!LEAD_CATEGORIES.has(r.segments.conversionActionCategory ?? "")) continue;
    const key = `${r.campaign.id}:${r.segments.date}`;
    leadsByKey.set(key, (leadsByKey.get(key) ?? 0) + Number(r.metrics.conversions ?? 0));
  }

  return spendRows.map((r) => ({
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    day: r.segments.date,
    spend: (Number(r.metrics.costMicros ?? 0) / 1_000_000).toFixed(2),
    clicks: Number(r.metrics.clicks ?? 0),
    impressions: Number(r.metrics.impressions ?? 0),
    // Google attributes fractionally (a call can count as 0.5); round once, at
    // the end, so a day's total is not skewed by rounding each campaign twice.
    leads: Math.round(leadsByKey.get(`${r.campaign.id}:${r.segments.date}`) ?? 0),
  }));
}

export type GoogleBudget = {
  campaignId: string;
  dailyBudget: string | null;
  status: string | null;
};

/**
 * Current daily budget per campaign. Simpler than Meta: Google has no
 * campaign-versus-adset budget split, so there is no fallback to write.
 */
export async function getCampaignBudgets(customerId: string): Promise<GoogleBudget[]> {
  const rows = await search<{
    campaign: { id: string; status?: string };
    campaignBudget?: { amountMicros?: string };
  }>(
    customerId,
    `SELECT campaign.id, campaign.status, campaign_budget.amount_micros FROM campaign`
  );

  return rows.map((r) => ({
    campaignId: r.campaign.id,
    dailyBudget: r.campaignBudget?.amountMicros
      ? (Number(r.campaignBudget.amountMicros) / 1_000_000).toFixed(2)
      : null,
    status: r.campaign.status ?? null,
  }));
}
