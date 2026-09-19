"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MarkAllButton({ channelId }: { channelId?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    if (busy) return;
    setBusy(true);
    await fetch("/api/videos/mark-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Number.isInteger(channelId) ? { channelId } : {}),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <button
      onClick={markAll}
      disabled={busy}
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {busy ? "处理中…" : "全部标为已看"}
    </button>
  );
}
