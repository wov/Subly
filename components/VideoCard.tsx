"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { relativeTime, platformLabel } from "@/lib/format";

export type CardVideo = {
  id: number;
  title: string;
  url: string;
  thumbnail_url: string | null;
  published_at: string;
  channel_name?: string;
  channel_avatar?: string | null;
  channel_platform?: string;
};

export default function VideoCard({ video }: { video: CardVideo }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const marked = useRef(false);

  async function markWatched() {
    if (marked.current) return;
    marked.current = true;
    setHidden(true);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    }).catch(() => {});
    setTimeout(() => router.refresh(), 250);
  }

  function open() {
    // 打开视频的同时标记已看，实现“看过的不再展示”
    void markWatched();
    window.open(video.url, "_blank", "noopener");
  }

  if (hidden) return null;

  return (
    <article className="group relative">
      <div
        onClick={open}
        className="cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="relative aspect-video bg-gray-100 dark:bg-gray-800">
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail_url}
              alt={video.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {platformLabel(video.channel_platform ?? "")}
          </span>
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
            {video.title}
          </h3>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {video.channel_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.channel_avatar}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] dark:bg-gray-700">
                {(video.channel_name ?? "?").slice(0, 1)}
              </span>
            )}
            <span className="truncate">{video.channel_name}</span>
            <span className="ml-auto shrink-0">{relativeTime(video.published_at)}</span>
          </div>
        </div>
      </div>
      <button
        onClick={markWatched}
        title="标记为已看（不打开视频）"
        className="absolute right-2 top-2 hidden rounded-md bg-black/70 px-2 py-1 text-[11px] text-white backdrop-blur transition hover:bg-black group-hover:block"
      >
        标为已看
      </button>
    </article>
  );
}
