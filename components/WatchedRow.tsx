"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { relativeTime, platformLabel } from "@/lib/format";
import type { CardVideo } from "./VideoCard";

export default function WatchedRow({ video }: { video: CardVideo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: false }),
    }).catch(() => setBusy(false));
    router.refresh();
  }

  return (
    <li className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800/60">
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail_url}
          alt=""
          className="h-12 w-20 shrink-0 rounded-md object-cover opacity-70"
        />
      ) : (
        <div className="h-12 w-20 shrink-0 rounded-md bg-gray-200 dark:bg-gray-800" />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-1 text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
        >
          {video.title}
        </a>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span>{platformLabel(video.channel_platform ?? "")}</span>
          <span className="truncate">{video.channel_name}</span>
          <span>{relativeTime(video.published_at)}</span>
        </div>
      </div>
      <button
        onClick={restore}
        disabled={busy}
        className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        恢复未看
      </button>
    </li>
  );
}
