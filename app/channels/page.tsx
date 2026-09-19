import AddChannelForm from "@/components/AddChannelForm";
import ChannelManager, { type ManagedChannel } from "@/components/ChannelManager";
import RefreshButton from "@/components/RefreshButton";
import SetupGuide from "@/components/SetupGuide";
import { listChannels } from "@/lib/refresh";
import { dbConfigured, ensureSchema, sql, typed } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  let channels: Awaited<ReturnType<typeof listChannels>> = [];
  let counts: { channel_id: number; unwatched: number; total: number }[] = [];
  try {
    await ensureSchema();
    channels = await listChannels();
    counts = typed<{ channel_id: number; unwatched: number; total: number }>(await sql`
      SELECT channel_id,
             COUNT(*) FILTER (WHERE watched = false)::int AS unwatched,
             COUNT(*)::int AS total
      FROM videos GROUP BY channel_id
    `);
  } catch (err) {
    return (
      <SetupGuide
        configured={dbConfigured()}
        error={err instanceof Error ? err.message : String(err)}
      />
    );
  }
  const byId = new Map(counts.map((c) => [c.channel_id, c]));
  const managed: ManagedChannel[] = channels.map((c) => ({
    id: c.id,
    platform: c.platform,
    name: c.name,
    avatar_url: c.avatar_url,
    url: c.url,
    unwatched: byId.get(c.id)?.unwatched ?? 0,
    total: byId.get(c.id)?.total ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-lg font-bold">订阅管理 · {channels.length}</h1>
        <RefreshButton />
      </div>
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-sm font-semibold">添加订阅</h2>
        <AddChannelForm />
      </section>
      <section className="rounded-xl border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="pt-4 text-sm font-semibold">我的订阅</h2>
        <ChannelManager channels={managed} />
      </section>
    </div>
  );
}
