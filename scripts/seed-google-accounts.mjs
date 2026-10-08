/**
 * Discovers every Google Ads customer the service account can read and upserts
 * it alongside the Meta accounts. Safe to re-run.
 *
 * Run once after Explorer access is granted and the service account has been
 * added under Google Ads → Admin → Access and security.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const { listManagedCustomers } = await import("../lib/google/client.ts");

const customers = await listManagedCustomers();
console.log(`${customers.length} active account(s) under the manager`);

const conn = await mysql.createConnection(env.DATABASE_URL);
for (const info of customers) {
  await conn.query(
    `INSERT INTO ad_accounts (platform, account_id, name, currency, timezone, is_active)
     VALUES ('GOOGLE', ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE name=VALUES(name), currency=VALUES(currency), timezone=VALUES(timezone)`,
    [info.customerId, info.name, info.currency, info.timezone]
  );
  console.log(`  ${info.customerId}  ${info.name}  ${info.currency}  ${info.timezone}`);
}
await conn.end();
