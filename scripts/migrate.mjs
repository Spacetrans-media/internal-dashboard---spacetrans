/**
 * Applies the SQL files in ./migrations in filename order, once each.
 *
 * drizzle-kit push is fine for local iteration but prompts interactively and
 * compares whole-schema state; on a server we want an explicit, ordered,
 * replayable list. Applied files are recorded so re-running is a no-op.
 */
import mysql from "mysql2/promise";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const url = process.env.DATABASE_URL || env.DATABASE_URL;
const conn = await mysql.createConnection({ uri: url, multipleStatements: true });

await conn.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

const [done] = await conn.query("SELECT name FROM _migrations");
const applied = new Set(done.map((r) => r.name));

const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}`);
    continue;
  }
  const sql = readFileSync(join("migrations", file), "utf8");
  try {
    await conn.query(sql);
    await conn.query("INSERT INTO _migrations (name) VALUES (?)", [file]);
    console.log(`  ok    ${file}`);
    ran++;
  } catch (err) {
    console.error(`  FAIL  ${file}: ${err.message}`);
    process.exit(1);
  }
}

console.log(ran ? `applied ${ran} migration(s)` : "nothing to apply");
await conn.end();
