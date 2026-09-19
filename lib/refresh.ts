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

/** 新增订阅：解析 → 入库（频道全局共享）→ 建立订阅关系 → 立即拉一次视频 */
export async function addChannel(userId: number, input: string): Promise<Channel> {
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
  await sql`
    INSERT INTO subscriptions (user_id, channel_id) VALUES (${userId}, ${row.id})
    ON CONFLICT DO NOTHING
  `;
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

/** 拉取单个频道的最新视频并入库（全局共享，不覆盖任何用户的已看状态） */
export async function refreshChannel(channel: Channel): Promise<number> {
  const adapter = ADAPTERS[channel.platform];
  const videos = await adapter.fetchVideos(channel.platform_id);
  if (videos.length > 0) {
    // postgres.js 多行插入：sql(对象数组, 列名...) 生成
    // insert into videos ("col", ...) values ($1, $2, ...), (...) ...
    const rows = videos.map((v) => ({
      channel_id: channel.id,
      video_id: v.videoId,
      title: v.title,
      url: v.url,
      thumbnail_url: v.thumbnailUrl,
      description: v.description,
      published_at: v.publishedAt,
    }));
    await sql`
      INSERT INTO videos ${sql(
        rows,
        "channel_id",
        "video_id",
        "title",
        "url",
        "thumbnail_url",
        "description",
        "published_at"
      )}
      ON CONFLICT (channel_id, video_id) DO NOTHING
    `;
  }
  await sql`UPDATE channels SET last_fetched_at = now() WHERE id = ${channel.id}`;
  // 订阅时没拿到频道名（如 B 站风控拦截）→ 用视频作者名补齐
  if ((!channel.name || channel.name === "加载中…") && videos[0]?.author) {
    await sql`UPDATE channels SET name = ${videos[0].author} WHERE id = ${channel.id}`;
  }
  return videos.length;
}

/** 当前用户的订阅列表 */
export async function listChannels(userId: number): Promise<Channel[]> {
  await ensureSchema();
  return typed<Channel>(await sql`
    SELECT c.* FROM channels c
    JOIN subscriptions s ON s.channel_id = c.id
    WHERE s.user_id = ${userId}
    ORDER BY s.created_at DESC
  `);
}

/** 刷新所有仍被订阅的频道；单个失败不影响其他 */
export async function refreshAll(): Promise<{ ok: number; failed: number }> {
  await ensureSchema();
  const channels = typed<Channel>(await sql`
    SELECT c.* FROM channels c
    WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.channel_id = c.id)
  `);
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

const AUTO_REFRESH_INTERVAL_MIN = 15;

/** 页面加载时按需刷新：我的订阅里有过期频道才触发 */
export async function maybeAutoRefresh(userId: number): Promise<void> {
  await ensureSchema();
  const [row] = typed<{ n: number }>(await sql`
    SELECT COUNT(*)::int AS n FROM subscriptions s
    JOIN channels c ON c.id = s.channel_id
    WHERE s.user_id = ${userId}
      AND (c.last_fetched_at IS NULL OR c.last_fetched_at < now() - interval '15 minutes')
  `);
  if (row && row.n > 0) await refreshAll();
}

export type VideoQuery = {
  watched: boolean;
  channelId?: number;
  limit?: number;
};

/** 当前用户的视频列表（按订阅范围 + 个人已看状态过滤） */
export async function listVideos(userId: number, q: VideoQuery): Promise<Video[]> {
  await ensureSchema();
  const limit = q.limit ?? 200;
  const watchedFilter = q.watched
    ? sql`EXISTS (SELECT 1 FROM watched w WHERE w.user_id = ${userId} AND w.video_id = v.id)`
    : sql`NOT EXISTS (SELECT 1 FROM watched w WHERE w.user_id = ${userId} AND w.video_id = v.id)`;
  return typed<Video>(await sql`
    SELECT v.*, c.name AS channel_name, c.avatar_url AS channel_avatar, c.platform AS channel_platform
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    JOIN subscriptions s ON s.channel_id = c.id AND s.user_id = ${userId}
    WHERE ${watchedFilter}
      ${q.channelId ? sql`AND v.channel_id = ${q.channelId}` : sql``}
    ORDER BY v.published_at DESC
    LIMIT ${limit}
  `);
}

/** 标记/取消已看（用户维度） */
export async function setWatched(userId: number, videoId: number, watched: boolean): Promise<boolean> {
  await ensureSchema();
  if (watched) {
    const rows = await sql`
      INSERT INTO watched (user_id, video_id)
      SELECT ${userId}, v.id FROM videos v
      JOIN subscriptions s ON s.channel_id = v.channel_id AND s.user_id = ${userId}
      WHERE v.id = ${videoId}
      ON CONFLICT DO NOTHING
      RETURNING video_id
    `;
    return rows.length > 0;
  }
  const rows = await sql`DELETE FROM watched WHERE user_id = ${userId} AND video_id = ${videoId} RETURNING video_id`;
  return rows.length > 0;
}

/** 全部标记为已看（可选按频道） */
export async function markAllWatched(userId: number, channelId?: number): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO watched (user_id, video_id)
    SELECT ${userId}, v.id FROM videos v
    JOIN subscriptions s ON s.channel_id = v.channel_id AND s.user_id = ${userId}
    WHERE NOT EXISTS (SELECT 1 FROM watched w WHERE w.user_id = ${userId} AND w.video_id = v.id)
      ${Number.isInteger(channelId) ? sql`AND v.channel_id = ${channelId as number}` : sql``}
    ON CONFLICT DO NOTHING
  `;
}

/** 取消订阅；频道无人订阅时连同视频一起清理 */
export async function unsubscribe(userId: number, channelId: number): Promise<boolean> {
  await ensureSchema();
  const rows = await sql`
    DELETE FROM subscriptions WHERE user_id = ${userId} AND channel_id = ${channelId}
    RETURNING channel_id
  `;
  if (rows.length === 0) return false;
  await sql`
    DELETE FROM channels c
    WHERE c.id = ${channelId}
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.channel_id = c.id)
  `;
  return true;
}

/** 当前用户的频道视频计数 */
export async function channelCounts(
  userId: number
): Promise<{ channel_id: number; unwatched: number; total: number }[]> {
  await ensureSchema();
  return typed<{ channel_id: number; unwatched: number; total: number }>(await sql`
    SELECT s.channel_id,
           COUNT(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM watched w
               WHERE w.user_id = ${userId} AND w.video_id = v.id
             )
           )::int AS unwatched,
           COUNT(*)::int AS total
    FROM subscriptions s
    JOIN videos v ON v.channel_id = s.channel_id
    WHERE s.user_id = ${userId}
    GROUP BY s.channel_id
  `);
}
