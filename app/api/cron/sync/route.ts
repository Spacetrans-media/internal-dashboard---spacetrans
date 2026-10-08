/**
 * Nightly sync endpoint.
 *
 * Called by the scheduler with `Authorization: Bearer <CRON_SECRET>`. Returns
 * 200 even when individual accounts fail, so one broken account never makes the
 * scheduler retry the whole run — per-account errors are in the response and in
 * the sync_runs table.
 */
import { NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/sync";

// No `export const dynamic` here: with `cacheComponents` enabled (next.config.ts)
// routes are dynamic by default and you opt INTO caching with `use cache`.
// Setting it is a build error in Next 16.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?months=N backfills N calendar months of history instead of the nightly
  // trailing window. Run once after connecting an account; the nightly job
  // alone would leave every earlier month missing from range queries.
  const months = Number(new URL(request.url).searchParams.get("months") ?? 0);

  const started = Date.now();
  const results = await syncAllAccounts("cron", Number.isFinite(months) ? months : 0);

  return NextResponse.json({
    ok: true,
    mode: months > 0 ? `backfill ${months} months` : "nightly",
    ms: Date.now() - started,
    accounts: results.length,
    rows: results.reduce((n, r) => n + r.rows, 0),
    failed: results.filter((r) => r.error).map((r) => ({ account: r.accountId, error: r.error })),
  });
}
