"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Campaign name search. Debounced so typing "trident" fires one query, not
 * seven, and kept in the URL like every other filter so a search can be shared.
 */
export function SearchBox({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams(params.toString());
      if (text.trim()) q.set("q", text.trim());
      else q.delete("q");
      router.push(`?${q.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [text, value, params, router]);

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search campaigns"
        className="w-56 rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-8 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
      />
      {text ? (
        <button
          onClick={() => setText("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
