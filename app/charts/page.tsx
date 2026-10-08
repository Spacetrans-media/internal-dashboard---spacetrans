import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getAccounts, getDailySeries, getDashboard, defaultDay } from "@/lib/queries";
import { ago, inr, inr2, num, prettyDate } from "@/lib/format";
import { logout, syncNow } from "../actions";
import { SyncButton } from "../sync-button";
import { RangeForm } from "../range-form";
import { SearchBox } from "../search-box";
import { Nav } from "../nav";
import { spendTitle, sourceNote } from "@/lib/platforms";
import { LeadsOverTime, SpendOverTime, TopCampaigns } from "./charts-client";

// Auth gates the whole page, so rendering deliberately blocks on the session
// cookie. `instant = false` tells Next 16 that is intentional rather than an
// oversight — streaming a shell and then redirecting would be worse UX.
export const instant = false;

type Params = Promise<{
  since?: string;
  until?: string;
  account?: string;
  q?: string;
}>;

export default async function ChartsPage({ searchParams }: { searchParams: Params }) {
  if (!(await isLoggedIn())) redirect("/login");

  return (
    <main className="min-h-dvh bg-neutral-50">
      <Suspense fallback={<div className="mx-auto max-w-[1400px] px-6 py-10 text-sm text-neutral-400">Loading…</div>}>
        <Charts searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Charts({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const fallback = await defaultDay();
  // Charts of a single day are a row of one bar — useless. Default this view to
  // the last 30 days so it opens on something with a shape to read.
  const monthAgo = (() => {
    const d = new Date(`${fallback}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  })();

  const since = sp.since || monthAgo;
  const until = sp.until || fallback;
  const accountId = sp.account ? Number(sp.account) : undefined;
  const q = sp.q ?? "";

  const [data, series, accounts] = await Promise.all([
    getDashboard(since, until, accountId, q),
    getDailySeries(since, until, accountId, q),
    getAccounts(),
  ]);

  // Pass the full name through: the chart shortens it for the axis label but
  // keeps the whole thing for the tooltip, and keys on the campaign id so two
  // similar names can never collide.
  const topCampaigns = data.rows.slice(0, 8).map((r) => ({
    id: r.campaignId,
    name: r.campaignName,
    spend: r.spend,
    leads: r.leads,
  }));

  const cpl = data.totals.leads > 0 ? data.totals.spend / data.totals.leads : null;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{spendTitle(data.platforms)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {prettyDate(since)} to {prettyDate(until)}
            {" · "}
            {data.lastSyncedAt ? <span>Synced {ago(data.lastSyncedAt)}</span> : <span>Never synced</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Nav />
          <SyncButton action={syncNow} />
          <form action={logout}>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <RangeForm
          since={since}
          until={until}
          account={sp.account}
          defaultDay={fallback}
          earliestDay={data.earliestDay}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, platform: a.platform }))}
          inline
        />
        <SearchBox value={q} />
      </div>

      {q ? (
        <p className="mt-3 text-sm text-neutral-500">
          Showing {data.totals.campaigns} campaign{data.totals.campaigns === 1 ? "" : "s"} matching
          &ldquo;{q}&rdquo;.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        <Stat label="Total spent" value={inr(data.totals.spend)} big />
        <Stat label="Leads" value={num(data.totals.leads)} />
        <Stat label="Cost per lead" value={cpl === null ? "—" : inr2(cpl)} />
        <Stat label="Campaigns" value={num(data.totals.campaigns)} />
      </div>

      <div className="mt-4 grid gap-4">
        <SpendOverTime data={series} />
        <div className="grid gap-4 lg:grid-cols-2">
          <TopCampaigns data={topCampaigns} />
          <LeadsOverTime data={series} />
        </div>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        {sourceNote(data.platforms)}
      </p>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums tracking-tight text-neutral-900 ${
          big ? "text-3xl" : "text-2xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
