"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "https://www.youtube.com/@MKBHD",
  "https://space.bilibili.com/220893216",
  "https://www.youtube.com/watch?v=…",
];

export default function AddChannelForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "订阅失败，请稍后重试");
        return;
      }
      setUrl("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴 YouTube 频道/视频链接，或 B 站空间/视频链接"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "订阅中…" : "订阅"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          支持：{EXAMPLES.join("、")} 或直接粘贴频道 ID / UID
        </p>
      )}
    </form>
  );
}
