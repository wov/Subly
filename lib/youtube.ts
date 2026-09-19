import { XMLParser } from "fast-xml-parser";
import type { FetchedChannel, FetchedVideo, PlatformAdapter } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchPage(url: string, timeoutMs = 10000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`请求 YouTube 页面失败（HTTP ${res.status}）`);
  return res.text();
}

/** 从任意 YouTube 链接 / 频道 ID 解析出 channel_id */
export async function resolveChannelId(input: string): Promise<string> {
  const raw = input.trim();

  // 直接就是频道 ID
  if (/^UC[\w-]{22}$/.test(raw)) return raw;

  let url = raw;
  if (!/^https?:\/\//i.test(raw)) url = `https://${raw}`;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("无法识别的 YouTube 频道地址");
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
    throw new Error("不是 YouTube 链接，请检查输入");
  }

  // /channel/UCxxxx
  const mChannel = u.pathname.match(/\/channel\/(UC[\w-]{22})/);
  if (mChannel) return mChannel[1];

  // 视频页：youtu.be/ID 、watch?v=ID 、/shorts/ID
  const videoId =
    host === "youtu.be"
      ? u.pathname.slice(1).split("/")[0]
      : u.searchParams.get("v") || u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
  if (videoId && /^[\w-]{11}$/.test(videoId)) {
    const html = await fetchPage(`https://www.youtube.com/watch?v=${videoId}`);
    const m = html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/);
    if (m) return m[1];
    throw new Error("无法从视频页解析出频道，请换用频道主页链接");
  }

  // @handle / /c/xxx / /user/xxx / /@handle
  if (/^\/(@[\w.%-]+|c\/[\w.-]+|user\/[\w.-]+)/.test(decodeURIComponent(u.pathname))) {
    const html = await fetchPage(`https://www.youtube.com${u.pathname}/videos`);
    // canonical 链接最可靠；页面里散落的 "channelId" 可能属于推荐货架上的其他频道
    const m =
      html.match(
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/
      ) ||
      html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/) ||
      html.match(/channel\/(UC[\w-]{22})/);
    if (m) return m[1];
    throw new Error("无法解析该频道主页，请确认链接是否正确");
  }

  throw new Error(
    "支持的形式：频道主页链接、@handle、/channel/UC… 链接、视频链接或直接粘贴频道 ID"
  );
}

function pick<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });

/** "3 days ago" / "2 months ago" → 近似时间 */
function parseRelativeTime(s: string | undefined): Date {
  if (!s) return new Date();
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return new Date(); // "Streamed"/"Premiered" 等按刚刚处理
  const n = Number(m[1]);
  const unitMs: Record<string, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return new Date(Date.now() - n * unitMs[m[2].toLowerCase()]);
}

type YtNode = Record<string, unknown>;

/** 深度遍历 ytInitialData，收集视频节点（videoRenderer 或新版 lockupViewModel） */
function collectVideoNodes(node: unknown, out: Map<string, { title: string; rel?: string }>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectVideoNodes(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as YtNode;

  // 旧版结构：videoRenderer / gridVideoRenderer
  if (typeof obj.videoId === "string" && !out.has(obj.videoId)) {
    const title = obj.title as YtNode | undefined;
    const text =
      (title?.runs as YtNode[] | undefined)?.[0]?.text ??
      title?.simpleText ??
      (obj.headline as YtNode | undefined)?.simpleText;
    const rel = (obj.publishedTimeText as YtNode | undefined)?.simpleText as string | undefined;
    if (typeof text === "string") out.set(obj.videoId, { title: text, rel });
  }

  // 新版结构：lockupViewModel（contentId + lockupMetadataViewModel）
  if (
    typeof obj.contentId === "string" &&
    obj.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" &&
    !out.has(obj.contentId)
  ) {
    const md = (obj.metadata as YtNode | undefined)?.lockupMetadataViewModel as
      | YtNode
      | undefined;
    const title = md?.title as YtNode | undefined;
    if (typeof title?.content === "string") {
      // 日期在 contentMetadataRows 里，部分页面懒加载没有 → rel 为 undefined
      const rows = (md?.metadata as YtNode | undefined)?.contentMetadataRows as
        | YtNode[]
        | undefined;
      let rel: string | undefined;
      for (const r of rows ?? []) {
        const parts = r?.metadataParts as YtNode[] | undefined;
        for (const p of parts ?? []) {
          const t = (p?.text as YtNode | undefined)?.content;
          if (typeof t === "string" && /ago/i.test(t)) rel = t;
        }
      }
      out.set(obj.contentId, { title: title.content, rel });
    }
  }

  for (const v of Object.values(obj)) collectVideoNodes(v, out);
}

/** RSS 失效时兜底：解析频道 /videos 页内嵌的 ytInitialData */
async function scrapeVideos(channelId: string): Promise<FetchedVideo[]> {
  const html = await fetchPage(
    `https://www.youtube.com/channel/${channelId}/videos`,
    20000
  );
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error("页面结构变化，无法解析视频列表（兜底抓取失败）");
  const data = JSON.parse(m[1]) as unknown;
  const found = new Map<string, { title: string; rel?: string }>();
  collectVideoNodes(data, found);
  // 页面本身按最新在前排列；无日期时按位次递减推算，保证排序稳定
  return Array.from(found.entries()).map(([videoId, v], i) => ({
    videoId,
    title: v.title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    description: null,
    publishedAt: v.rel
      ? parseRelativeTime(v.rel)
      : new Date(Date.now() - i * 3_600_000),
  }));
}

/** 通过官方 RSS 拉取频道最新 15 条视频（无需 API Key）；RSS 故障时回退到页面抓取 */
async function fetchVideos(channelId: string): Promise<FetchedVideo[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { signal: AbortSignal.timeout(15000), cache: "no-store" }
    );
    if (res.ok) {
      const data = xml.parse(await res.text());
      const entries = pick(data?.feed?.entry);
      if (entries) {
        const list = Array.isArray(entries) ? entries : [entries];
        return list.map((e: Record<string, unknown>) => {
          const videoId = String(e["videoId"] ?? "");
          const group = pick(e["group"] as Record<string, unknown> | Record<string, unknown>[]);
          const thumbRaw = pick(group?.["thumbnail"] as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | undefined);
          const description = String(group?.["description"] ?? "");
          return {
            videoId,
            title: String(e["title"] ?? ""),
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnailUrl:
              (thumbRaw && (thumbRaw["@_url"] as string)) ||
              (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
            description: description.slice(0, 500),
            publishedAt: new Date(String(e["published"] ?? 0)),
          } satisfies FetchedVideo;
        });
      }
    }
  } catch {
    // RSS 网络失败 → 尝试兜底
  }
  return scrapeVideos(channelId);
}

async function fetchChannelMeta(channelId: string) {
  try {
    const html = await fetchPage(`https://www.youtube.com/channel/${channelId}/videos`);
    const name =
      html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
      html.match(/"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"/)?.[1];
    const avatar = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1];
    return {
      name: name ? decodeEntities(name) : undefined,
      avatarUrl: avatar || undefined,
    };
  } catch {
    return {};
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export const youtubeAdapter: PlatformAdapter = {
  async resolve(input) {
    const channelId = await resolveChannelId(input);
    const meta = await fetchChannelMeta(channelId);
    const channel: FetchedChannel = {
      platform: "youtube",
      platformId: channelId,
      name: meta.name || "",
      avatarUrl: meta.avatarUrl || null,
      url: `https://www.youtube.com/channel/${channelId}`,
    };
    return channel;
  },
  fetchVideos,
  fetchChannelMeta,
};
