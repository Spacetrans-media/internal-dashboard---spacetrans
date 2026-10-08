# Ad spend dashboard

Internal tool for Spacetrans. Shows daily Meta and Google Ads spend per campaign
in one place, so nobody has to ask the PPC team for numbers.

Not multi-tenant, not for sale, one shared password.

## What it shows

Per campaign: spend, leads, clicks, conversion rate, daily budget, cost per lead.
Defaults to **yesterday** — the current day is deliberately excluded, because both
platforms still report it as an estimate that moves all day.

Three views: **Dashboard** (platform split, daily mix, top campaigns), **Charts**
(time series), **Table** (row-level data, searchable).

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Hostinger MySQL. Remote access must be whitelisted per IP. |
| `META_ACCESS_TOKEN` | Business Manager → System Users → token with `ads_read`. Never expires. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Cloud service-account key, pasted as one line. |
| `GOOGLE_LOGIN_CUSTOMER_ID` | The MCC customer id, **digits only** — hyphens cause a silent 401. |
| `DASHBOARD_PASSWORD` | The shared login. |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | Bearer token the nightly sync expects. |

## Setting up a new account

```bash
node scripts/migrate.mjs               # apply SQL migrations, in order, once each
node scripts/seed-accounts.mjs         # discover Meta ad accounts
node --experimental-strip-types scripts/seed-google-accounts.mjs
```

Then **backfill once**, or every range before today will be empty:

```
GET /api/cron/sync?months=14     Authorization: Bearer $CRON_SECRET
```

The nightly job (`GET /api/cron/sync`) only re-reads a trailing 7 days. That window
exists to absorb restatements, not to fetch history.

## Things that will bite you

**Meta returns five identical lead action types.** `lead`,
`onsite_conversion.lead_grouped` and three `offsite_*_add_meta_leads` all carry the
*same* number. Summing them inflates leads 5× and divides cost-per-lead by 5. Take
the first match from the priority list; never sum.

**Google refuses to mix cost with conversion-category segmentation.** Selecting
`metrics.cost_micros` alongside `segments.conversion_action_category` returns a 400
— which is the API protecting you from spend being repeated once per category. So
spend and leads come from two separate queries, joined on campaign and date.

**Money arrives in different units.** Meta budgets are in paise (÷100) while Meta
spend is in rupees; Google uses micros (÷1,000,000) for both. Everything in the
database is rupees.

**Campaign budgets hide on Meta ad sets.** With Campaign Budget Optimisation off,
the campaign-level daily budget is empty and the real figure is the sum of the
*active* ad sets. Counting paused ones overstates it.

**`listAccessibleCustomers` does not list accounts under a manager.** It returns
only what the service account is directly linked to — for an MCC link, just the MCC.
Querying `customer_client` from the manager is what enumerates the real accounts.

**Hostinger closes idle MySQL connections.** The pool retires its own after 30s and
keeps at most two idle. Without that, the first page load after a quiet night dies
with `ECONNRESET` — i.e. every morning.

**Next 16 specifics.** The middleware file is `proxy.ts`; creating `middleware.ts`
silently does nothing. `cacheComponents` is on, so `export const dynamic` is a build
error and auth-gated pages carry `export const instant = false` instead.

## Reconciliation

Both integrations were checked against the platforms' own account-level totals
before being trusted — Meta's September matched to the paisa, Google's to three
paise (per-row rounding). Re-run that check after any change to the sync: a spend
dashboard that disagrees with the platform is worse than no dashboard.
