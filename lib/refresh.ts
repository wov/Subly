import { ensureSchema, sql, typed, type Channel, type Video } from "./db";
import { bilibiliAdapter } from "./bilibili";
import { youtubeAdapter } from "./youtube";
import type { Platform, PlatformAdapter } from "./types";

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  youtube: youtubeAdapter,
  bilibili: bilibiliAdapter,
};

export function detectPlatform(input: string): Platform | null {
  const s = input.trim().toLowerCase();
  if (/bilibili\.com|b23\.tv/.test(s)) return "bilibili";
  if (/youtube\.com|youtu\.be|^uc[\w-]{22}$/.test(s)) return "youtube";
  if (/^\d+$/.test(s)) return "bilibili"; // 纯数字视为 B 站 UID
  return null;
}

/** 新增订阅：解析 → 入库 → 立即拉一次视频 */
export async function addChannel(input: string): Promise<Channel> {
  const platform = detectPlatform(input);
  if (!platform) {
    throw new Error(
      "无法识别平台：请粘贴 YouTube 频道/视频链接，或 B 站空间/视频链接（也可直接粘贴频道 ID 或 UID）"
    );
  }
  await ensureSchema();
  const info = await ADAPTERS[platform].resolve(input);
  const rows = typed<Channel>(await sql`
    INSERT INTO channels (platform, platform_id, name, avatar_url, url)
    VALUES (${info.platform}, ${info.platformId}, ${info.name || "加载中…"}, ${info.avatarUrl}, ${info.url})
    ON CONFLICT (platform, platform_id) DO UPDATE SET url = EXCLUDED.url
    RETURNING *
  `);
  const row = rows[0];
  if (!row.name || row.name === "加载中…") {
    // 名字没拿到时从视频源补齐
    const meta = (await ADAPTERS[platform].fetchChannelMeta?.(info.platformId)) ?? {};
    if (meta.name) {
      await sql`UPDATE channels SET name = ${meta.name}, avatar_url = COALESCE(${meta.avatarUrl ?? null}, avatar_url) WHERE id = ${row.id}`;
      row.name = meta.name;
      if (meta.avatarUrl) row.avatar_url = meta.avatarUrl;
    }
  }
  await refreshChannel(row);
  return row;
}

/** 拉取单个频道的最新视频并入库（不覆盖已看状态） */
export async function refreshChannel(channel: Channel): Promise<number> {
  const adapter = ADAPTERS[channel.platform];
  const videos = await adapter.fetchVideos(channel.platform_id);
  if (videos.length > 0) {
    // 嵌套数组参数会被 postgres.js 展开为 VALUES (...), (...), ...
    const rows = videos.map((v) => [
      v.videoId,
      v.title,
      v.url,
      v.thumbnailUrl,
      v.description,
      v.publishedAt,
    ]);
    await sql`
      INSERT INTO videos (channel_id, video_id, title, url, thumbnail_url, description, published_at)
      SELECT ${channel.id} AS cid, t.*
      FROM (VALUES ${rows}) AS t(video_id, title, url, thumbnail_url, description, published_at)
      ON CONFLICT (channel_id, video_id) DO NOTHING
    `;
  }
  await sql`UPDATE channels SET last_fetched_at = now() WHERE id = ${channel.id}`;
  return videos.length;
}

export async function listChannels(): Promise<Channel[]> {
  await ensureSchema();
  return typed<Channel>(await sql`SELECT * FROM channels ORDER BY created_at DESC`);
}

/** 刷新所有频道；单个失败不影响其他 */
export async function refreshAll(): Promise<{ ok: number; failed: number }> {
  const channels = await listChannels();
  let ok = 0;
  let failed = 0;
  await Promise.allSettled(
    channels.map(async (c) => {
      try {
        await refreshChannel(c);
        ok += 1;
      } catch {
        failed += 1;
      }
    })
  );
  return { ok, failed };
}

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** 页面加载时按需刷新：距上次成功拉取超过 15 分钟才触发 */
export async function maybeAutoRefresh(): Promise<void> {
  await ensureSchema();
  const [row] = typed<{ n: number }>(await sql`
    SELECT COUNT(*)::int AS n FROM channels
    WHERE last_fetched_at IS NULL OR last_fetched_at < now() - interval '15 minutes'
  `);
  if (row && row.n > 0) await refreshAll();
}

export type VideoQuery = {
  watched: boolean;
  channelId?: number;
  limit?: number;
};

export async function listVideos(q: VideoQuery): Promise<Video[]> {
  await ensureSchema();
  const limit = q.limit ?? 200;
  return typed<Video>(await sql`
    SELECT v.*, c.name AS channel_name, c.avatar_url AS channel_avatar, c.platform AS channel_platform
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE v.watched = ${q.watched}
      ${q.channelId ? sql`AND v.channel_id = ${q.channelId}` : sql``}
    ORDER BY v.published_at DESC
    LIMIT ${limit}
  `);
}
