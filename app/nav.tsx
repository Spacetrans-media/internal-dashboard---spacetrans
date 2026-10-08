"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Table / Charts switch. Filters live in the URL, so carrying the query string
 * across means the two views always describe the same period and selection —
 * switching tabs never silently changes what you are looking at.
 */
export function Nav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();

  const tabs = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/charts", label: "Charts" },
    { href: "/", label: "Table" },
  ];

  return (
    <nav className="flex overflow-hidden rounded-lg border border-neutral-300 bg-white">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={qs ? `${t.href}?${qs}` : t.href}
            className={`px-3.5 py-2 text-sm font-medium border-r border-neutral-200 last:border-r-0 ${
              active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
