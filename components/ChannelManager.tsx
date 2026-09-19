"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { platformLabel } from "@/lib/format";

export type ManagedChannel = {
  id: number;
  platform: string;
  name: string;
  avatar_url: string | null;
  url: string;
  unwatched: number;
  total: number;
};

export default function ChannelManager({ channels }: { channels: ManagedChannel[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function remove(c: ManagedChannel) {
    if (!confirm(`确定取消订阅「${c.name}」吗？其视频记录将一并删除。`)) return;
    setBusyId(c.id);
    await fetch(`/api/channels/${c.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  async function markRead(c: ManagedChannel) {
    setBusyId(c.id);
    await fetch("/api/videos/mark-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: c.id }),
    }).catch(() => {});
    router.refresh();
  }

  if (channels.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
        还没有订阅任何频道，粘贴上方链接开始订阅吧
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800/60">
      {channels.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-3">
          {c.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm dark:bg-gray-700">
              {c.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-semibold hover:underline"
            >
              {c.name || "（未命名）"}
            </a>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {platformLabel(c.platform)} · {c.unwatched} 条未看 / 共 {c.total} 条
            </p>
          </div>
          {c.unwatched > 0 ? (
            <button
              onClick={() => markRead(c)}
              disabled={busyId === c.id}
              className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              全部已看
            </button>
          ) : null}
          <button
            onClick={() => remove(c)}
            disabled={busyId === c.id}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            取消订阅
          </button>
        </li>
      ))}
    </ul>
  );
}
