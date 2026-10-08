"use client";

import { useTransition } from "react";

/**
 * Manual refresh. The pending state matters more than it looks: a sync takes a
 * few seconds against Meta, and without feedback people click it repeatedly and
 * assume the page is broken.
 */
export function SyncButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => action())}
      disabled={pending}
      className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? "Syncing…" : "Sync now"}
    </button>
  );
}
