import WatchedRow from "@/components/WatchedRow";
import SetupGuide from "@/components/SetupGuide";
import { listVideos } from "@/lib/refresh";
import { dbConfigured } from "@/lib/db";
import type { CardVideo } from "@/components/VideoCard";

export const dynamic = "force-dynamic";

export default async function WatchedPage() {
  let videos: Awaited<ReturnType<typeof listVideos>> = [];
  try {
    videos = await listVideos({ watched: true, limit: 500 });
  } catch (err) {
    return (
      <SetupGuide
        configured={dbConfigured()}
        error={err instanceof Error ? err.message : String(err)}
      />
    );
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
      <h1 className="text-lg font-bold">已看记录 · {videos.length}</h1>
      {videos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          还没有已看的视频，看完的内容会出现在这里
        </p>
      ) : (
        <ul className="rounded-xl border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
          {cards.map((v) => (
            <WatchedRow key={v.id} video={v} />
          ))}
        </ul>
      )}
    </div>
  );
}
