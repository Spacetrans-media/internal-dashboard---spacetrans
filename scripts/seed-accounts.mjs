/**
 * Discovers every ad account the System User token can read and upserts it.
 * Safe to re-run: existing accounts keep their id, new ones get added.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const V = env.META_GRAPH_VERSION || "v21.0";
const u = new URL(`https://graph.facebook.com/${V}/me/adaccounts`);
u.searchParams.set("fields", "account_id,name,currency,timezone_name,account_status");
u.searchParams.set("limit", "200");
u.searchParams.set("access_token", env.META_ACCESS_TOKEN);

const body = await (await fetch(u)).json();
if (body.error) throw new Error(`${body.error.code}: ${body.error.message}`);

const conn = await mysql.createConnection(env.DATABASE_URL);
for (const a of body.data) {
  await conn.query(
    `INSERT INTO ad_accounts (platform, account_id, name, currency, timezone, is_active)
     VALUES ('META', ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), currency=VALUES(currency), timezone=VALUES(timezone)`,
    [a.account_id, a.name, a.currency, a.timezone_name]
  );
  console.log(`  ${a.account_id}  ${a.name}  ${a.currency}  ${a.timezone_name}`);
}
const [rows] = await conn.query("SELECT COUNT(*) n FROM ad_accounts");
console.log(`ad_accounts total: ${rows[0].n}`);
await conn.end();
