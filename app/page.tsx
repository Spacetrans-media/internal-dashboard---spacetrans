import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getAccounts, getDashboard, defaultDay } from "@/lib/queries";
import { ago, inr, inr2, num, pct, prettyDate } from "@/lib/format";
import { logout, syncNow } from "./actions";
import { SyncButton } from "./sync-button";
import { RangeForm } from "./range-form";
import { SearchBox } from "./search-box";
import { Nav } from "./nav";
import { PlatformIcon } from "./platform-icon";
import { spendTitle, sourceNote } from "@/lib/platforms";

// Auth gates the whole page, so rendering deliberately blocks on the session
// cookie. `instant = false` tells Next 16 that is intentional rather than an
// oversight — streaming a shell and then redirecting would be worse UX.
export const instant = false;

type Params = Promise<{ since?: string; until?: string; account?: string; q?: string }>;

export default async function Page({ searchParams }: { searchParams: Params }) {
  if (!(await isLoggedIn())) redirect("/login");

  return (
    <main className="min-h-dvh bg-neutral-50">
      <Suspense fallback={<Skeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="mt-8 h-28 animate-pulse rounded-xl bg-neutral-200" />
      <div className="mt-4 h-96 animate-pulse rounded-xl bg-neutral-200" />
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const fallback = await defaultDay();
  const since = sp.since || fallback;
  const until = sp.until || fallback;
  const accountId = sp.account ? Number(sp.account) : undefined;
  const q = sp.q ?? "";

  const [data, accounts] = await Promise.all([
    getDashboard(since, until, accountId, q),
    getAccounts(),
  ]);

  const singleDay = since === until;
  const mixedCurrency = data.currencies.length > 1;
  // A range reaching before our earliest synced day would quietly show a total
  // smaller than Meta's. Say so rather than letting someone quote the number.
  const beforeCoverage = data.earliestDay !== null && since < data.earliestDay;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{spendTitle(data.platforms)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {singleDay ? prettyDate(since) : `${prettyDate(since)} to ${prettyDate(until)}`}
            {" · "}
            {data.lastSyncedAt ? (
              <span>Synced {ago(data.lastSyncedAt)}</span>
            ) : (
              <span className="text-amber-700">Never synced</span>
            )}
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

      {beforeCoverage && data.earliestDay ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Data starts {prettyDate(data.earliestDay)}. This range begins earlier, so the totals below
          cover {prettyDate(data.earliestDay)} onwards only and will be lower than Meta&apos;s.
        </p>
      ) : null}

      {mixedCurrency ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Accounts use different currencies ({data.currencies.join(", ")}). Totals below are not
          meaningful until you filter to a single account.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
        <Stat label="Total spent" value={inr(data.totals.spend)} big />
        <Stat label="Leads" value={num(data.totals.leads)} />
        <Stat label="Clicks" value={num(data.totals.clicks)} />
        <Stat label="Campaigns" value={num(data.totals.campaigns)} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <Th className="w-[34%]">Campaign</Th>
                <Th align="right">Spent</Th>
                <Th align="right">Leads</Th>
                <Th align="right">Clicks</Th>
                <Th align="right">Conv. rate</Th>
                <Th align="right">Cost / lead</Th>
                <Th align="right">Daily budget</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-neutral-500">
                    {q
                      ? `No campaigns matching "${q}" spent in this period.`
                      : "No spend recorded for this period."}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr
                    key={r.campaignId}
                    className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900">{r.campaignName}</span>
                        <Status value={r.status} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                        <PlatformIcon platform={r.platform} />
                        {r.accountName}
                      </div>
                    </td>
                    <Td align="right" strong>
                      {inr(r.spend)}
                    </Td>
                    <Td align="right">{num(r.leads)}</Td>
                    <Td align="right" muted>
                      {num(r.clicks)}
                    </Td>
                    <Td align="right" muted>
                      {r.conversionRate === null ? "—" : pct(r.conversionRate)}
                    </Td>
                    <Td align="right">{r.costPerLead === null ? "—" : inr2(r.costPerLead)}</Td>
                    <Td align="right" muted>
                      {r.dailyBudget === null ? "—" : inr(r.dailyBudget)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {data.rows.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
                  <td className="px-4 py-3 text-neutral-900">Total</td>
                  <Td align="right" strong>
                    {inr(data.totals.spend)}
                  </Td>
                  <Td align="right">{num(data.totals.leads)}</Td>
                  <Td align="right">{num(data.totals.clicks)}</Td>
                  <Td align="right">
                    {data.totals.clicks > 0
                      ? pct((data.totals.leads / data.totals.clicks) * 100)
                      : "—"}
                  </Td>
                  <Td align="right">
                    {data.totals.leads > 0 ? inr2(data.totals.spend / data.totals.leads) : "—"}
                  </Td>
                  <Td align="right">—</Td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        {sourceNote(data.platforms)} Today is excluded, because Meta still reports it as an
        estimate. Daily budget is the campaign&apos;s current setting, not what it was during the
        period shown.
      </p>
    </div>
  );
}

/**
 * Campaign state at a glance.
 *
 * Colour carries the meaning here, so the tints are strong enough to read at a
 * glance rather than the near-white 50-weights, which look grey on a white row.
 * Green runs, amber stopped, grey retired, red needs attention — red is reserved
 * for states that genuinely need a human, so it stays meaningful when it appears.
 */
const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  ACTIVE: { pill: "bg-green-100 text-green-800", dot: "bg-green-600" },
  // Google's word for the same state Meta calls ACTIVE.
  ENABLED: { pill: "bg-green-100 text-green-800", dot: "bg-green-600" },
  REMOVED: { pill: "bg-neutral-200 text-neutral-600", dot: "bg-neutral-400" },
  PAUSED: { pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  CAMPAIGN_PAUSED: { pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  ADSET_PAUSED: { pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  IN_PROCESS: { pill: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  PENDING_REVIEW: { pill: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  ARCHIVED: { pill: "bg-neutral-200 text-neutral-600", dot: "bg-neutral-400" },
  DELETED: { pill: "bg-neutral-200 text-neutral-600", dot: "bg-neutral-400" },
  WITH_ISSUES: { pill: "bg-red-100 text-red-800", dot: "bg-red-500" },
  DISAPPROVED: { pill: "bg-red-100 text-red-800", dot: "bg-red-500" },
};

const FALLBACK_STATUS = { pill: "bg-neutral-200 text-neutral-600", dot: "bg-neutral-400" };

const NORMALISED_LABELS: Record<string, string> = {
  ENABLED: "ACTIVE",
  REMOVED: "DELETED",
};

function Status({ value }: { value: string | null }) {
  if (!value) return null;

  const style = STATUS_STYLES[value] ?? FALLBACK_STATUS;
  // The two platforms name the same states differently. Showing both words
  // would imply a difference that isn't there, so they are spoken as one.
  const normalised = NORMALISED_LABELS[value] ?? value;
  const label = normalised.charAt(0) + normalised.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.pill}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
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

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  muted,
  strong,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 tabular-nums ${align === "right" ? "text-right" : ""} ${
        muted ? "text-neutral-500" : "text-neutral-900"
      } ${strong ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );
}
