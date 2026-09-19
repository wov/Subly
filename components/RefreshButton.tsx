"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton({ label = "刷新" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {busy ? "刷新中…" : label}
    </button>
  );
}
