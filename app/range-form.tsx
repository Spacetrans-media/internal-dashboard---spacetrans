"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AccountPicker, type PickerAccount } from "./account-picker";

/**
 * Date range + account filter. State lives in the URL rather than React, so a
 * particular view can be bookmarked or pasted into a chat — which is exactly
 * what people do when they want someone else to look at the same numbers.
 */
export function RangeForm({
  since,
  until,
  account,
  defaultDay,
  earliestDay,
  accounts,
  inline,
}: {
  since: string;
  until: string;
  account?: string;
  defaultDay: string;
  earliestDay: string | null;
  accounts: PickerAccount[];
  /** Drop the outer top margin when the caller supplies its own flex row. */
  inline?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(next: Partial<{ since: string; until: string; account: string }>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.push(`/?${q.toString()}`);
  }

  const addDays = (day: string, delta: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  const presets: { label: string; since: string; until: string }[] = [
    { label: "Yesterday", since: defaultDay, until: defaultDay },
    { label: "Last 7 days", since: addDays(defaultDay, -6), until: defaultDay },
    { label: "Last 30 days", since: addDays(defaultDay, -29), until: defaultDay },
    { label: "This month", since: defaultDay.slice(0, 8) + "01", until: defaultDay },
  ];

  const activePreset = presets.find((p) => p.since === since && p.until === until)?.label;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${inline ? "" : "mt-6"}`}>
      <div className="flex overflow-hidden rounded-lg border border-neutral-300 bg-white">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => go({ since: p.since, until: p.until })}
            className={`px-3 py-2 text-sm whitespace-nowrap border-r border-neutral-200 last:border-r-0 ${
              activePreset === p.label
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
        <input
          type="date"
          value={since}
          min={earliestDay ?? undefined}
          max={until}
          onChange={(e) => go({ since: e.target.value })}
          className="bg-transparent text-sm text-neutral-700 outline-none"
        />
        <span className="text-neutral-400">to</span>
        <input
          type="date"
          value={until}
          min={since}
          max={defaultDay}
          onChange={(e) => go({ until: e.target.value })}
          className="bg-transparent text-sm text-neutral-700 outline-none"
        />
      </div>

      {accounts.length > 1 ? <AccountPicker accounts={accounts} value={account} /> : null}
    </div>
  );
}
