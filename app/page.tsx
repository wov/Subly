import Link from "next/link";
import VideoCard, { type CardVideo } from "@/components/VideoCard";
import MarkAllButton from "@/components/MarkAllButton";
import RefreshButton from "@/components/RefreshButton";
import { listChannels, listVideos, maybeAutoRefresh } from "@/lib/refresh";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  await maybeAutoRefresh();
  const { channel } = await searchParams;
  const channelId = channel && /^\d+$/.test(channel) ? Number(channel) : undefined;

  const [channels, videos] = await Promise.all([
    listChannels(),
    listVideos({ watched: false, channelId }),
  ]);

  const unwatchedByChannel = new Map<number, number>();
  for (const ch of channels) unwatchedByChannel.set(ch.id, 0);
  for (const v of await listVideos({ watched: false, limit: 1000 })) {
    unwatchedByChannel.set(v.channel_id, (unwatchedByChannel.get(v.channel_id) ?? 0) + 1);
  }

  const cards: CardVideo[] = videos.map((v) => ({
    id: v.id,
    title: v.title,
    url: v.url,
    thumbnail_url: v.thumbnail_url,
    published_at: v.published_at.toISOString(),
    channel_name: v.channel_name,
    channel_avatar: v.channel_avatar,
    channel_platform: v.channel_platform,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold">未看视频 · {videos.length}</h1>
        {videos.length > 0 ? <MarkAllButton channelId={channelId} /> : null}
        <RefreshButton />
      </div>

      {channels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/"
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !channelId
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            全部
          </Link>
          {channels.map((c) => {
            const n = unwatchedByChannel.get(c.id) ?? 0;
            return (
              <Link
                key={c.id}
                href={`/?channel=${c.id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  channelId === c.id
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {c.name} · {n}
              </Link>
            );
          })}
        </div>
      ) : null}

      {videos.length === 0 ? (
        channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">还没有任何订阅</p>
            <Link
              href="/channels"
              className="mt-3 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              添加第一个订阅
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              全部看完啦，暂时没有新的内容
            </p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
