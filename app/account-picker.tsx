"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlatformIcon } from "./platform-icon";
import { platformLabel } from "@/lib/platforms";

export type PickerAccount = { id: number; name: string; platform: string };

/**
 * Account filter with platform logos.
 *
 * A native <select> cannot render an image inside an <option> — the browser
 * draws those itself — so showing a logo per account means a custom listbox.
 * Accounts are grouped by platform, which also answers "which of these is
 * Google?" without reading a single name.
 */
export function AccountPicker({ accounts, value }: { accounts: PickerAccount[]; value?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — the two things people expect and
  // the two a hand-rolled dropdown usually forgets.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id?: number) {
    const q = new URLSearchParams(params.toString());
    if (id) q.set("account", String(id));
    else q.delete("account");
    setOpen(false);
    router.push(`?${q.toString()}`);
  }

  const selected = accounts.find((a) => String(a.id) === value);
  const groups = ["META", "GOOGLE"].filter((p) => accounts.some((a) => a.platform === p));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-[11rem] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        {selected ? (
          <>
            <PlatformIcon platform={selected.platform} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span>All accounts</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`ml-auto size-3.5 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-1 max-h-80 w-72 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <button
            role="option"
            aria-selected={!selected}
            onClick={() => pick()}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
              !selected ? "font-semibold text-neutral-900" : "text-neutral-700"
            }`}
          >
            All accounts
          </button>

          {groups.map((p) => (
            <div key={p}>
              <div className="mt-1 flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                <PlatformIcon platform={p} size={11} />
                {platformLabel(p)}
              </div>
              {accounts
                .filter((a) => a.platform === p)
                .map((a) => (
                  <button
                    key={a.id}
                    role="option"
                    aria-selected={selected?.id === a.id}
                    onClick={() => pick(a.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                      selected?.id === a.id ? "font-semibold text-neutral-900" : "text-neutral-700"
                    }`}
                  >
                    <PlatformIcon platform={a.platform} />
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
