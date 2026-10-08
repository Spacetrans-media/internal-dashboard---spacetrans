/**
 * Schema for the Spacetrans ad-spend dashboard.
 *
 * MariaDB on Hostinger, so: bigint autoincrement ids, never drizzle's
 * `serial()` (it emits a type MariaDB rejects).
 *
 * Money is stored as DECIMAL, never float. Spend arrives from Meta as a
 * decimal string in major units (rupees); daily budgets arrive as an integer
 * in MINOR units (paise) and are converted on the way in, so everything in
 * this database is rupees.
 */
import {
  mysqlTable, bigint, varchar, date, decimal, int, timestamp, uniqueIndex, index,
} from "drizzle-orm/mysql-core";

/** One row per Meta ad account we pull numbers for. */
export const adAccounts = mysqlTable(
  "ad_accounts",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    /**
     * Which ad platform this account belongs to. Everything downstream — spend
     * rows, budgets, the dashboard — is keyed on the local `id`, so adding a
     * platform costs a row here and a client module, nothing structural.
     */
    platform: varchar("platform", { length: 16 }).notNull().default("META"),
    /** The platform's own account id: Meta without the `act_` prefix, Google without hyphens. */
    accountId: varchar("account_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** ISO code from Meta, e.g. INR. Totals only sum across matching currencies. */
    currency: varchar("currency", { length: 8 }).notNull().default("INR"),
    /** Meta reports insights in the AD ACCOUNT's timezone, not ours. */
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kolkata"),
    isActive: int("is_active").notNull().default(1),
    lastSyncedAt: timestamp("last_synced_at"),
    lastError: varchar("last_error", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Unique per platform, not globally: a Meta and a Google account could in
  // principle carry the same numeric id.
  (t) => [uniqueIndex("uq_ad_accounts_platform_account").on(t.platform, t.accountId)]
);

/**
 * One row per campaign per day. The unique key makes re-syncing idempotent:
 * every run re-pulls the trailing week because Meta restates recent figures
 * for a few days after the fact, and we want to keep matching Ads Manager.
 */
export const adSpend = mysqlTable(
  "ad_spend",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    adAccountId: bigint("ad_account_id", { mode: "number" }).notNull(),
    campaignId: varchar("campaign_id", { length: 64 }).notNull(),
    campaignName: varchar("campaign_name", { length: 255 }).notNull(),
    /**
     * The ad account's local date, as Meta reported it. Kept as a string
     * (`mode: "string"`) so it never passes through a JS Date and gets shifted
     * by the server's timezone — these are local dates, not instants.
     */
    day: date("day", { mode: "string" }).notNull(),
    spend: decimal("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    clicks: int("clicks").notNull().default(0),
    impressions: int("impressions").notNull().default(0),
    /** Lead-type actions from Meta's `actions` array. */
    leads: int("leads").notNull().default(0),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_spend_account_campaign_day").on(t.adAccountId, t.campaignId, t.day),
    index("ix_spend_day").on(t.day),
  ]
);

/**
 * Current daily budget per campaign — a live setting, not history, so it is
 * kept apart from the per-day spend rows. `source` records whether it came
 * from the campaign itself (CBO on) or from summing its ad sets (CBO off).
 */
export const campaignBudgets = mysqlTable(
  "campaign_budgets",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    adAccountId: bigint("ad_account_id", { mode: "number" }).notNull(),
    campaignId: varchar("campaign_id", { length: 64 }).notNull(),
    dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
    source: varchar("source", { length: 16 }).notNull().default("campaign"),
    status: varchar("status", { length: 32 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_budget_account_campaign").on(t.adAccountId, t.campaignId)]
);

/** Append-only log of sync attempts, so a stale dashboard can explain itself. */
export const syncRuns = mysqlTable("sync_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  adAccountId: bigint("ad_account_id", { mode: "number" }),
  trigger: varchar("trigger", { length: 16 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  rowsWritten: int("rows_written").notNull().default(0),
  message: varchar("message", { length: 500 }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});
