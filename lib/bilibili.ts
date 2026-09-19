import { createHash } from "node:crypto";
import type { FetchedChannel, FetchedVideo, PlatformAdapter } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// WBI 签名所需的混淆字符表（B 站 web 端公开算法）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

type BiliApi<T> = { code: number; message: string; data: T };

let wbiCache: { key: string; cookie: string; expire: number } | null = null;

async function biliFetch(url: string, cookie?: string, timeoutMs = 12000) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com/",
    Accept: "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`请求 B 站接口失败（HTTP ${res.status}）`);
  return res.json() as Promise<BiliApi<unknown>>;
}

async function getWbi(force = false): Promise<{ key: string; cookie: string }> {
  if (!force && wbiCache && wbiCache.expire > Date.now()) return wbiCache;
  // 生成游客 Cookie，规避风控
  const spi = await biliFetch("https://api.bilibili.com/x/frontend/finger/spi");
  const cookie =
    spi.code === 0
      ? `buvid3=${(spi.data as { b_3: string }).b_3}; buvid4=${(spi.data as { b_4: string }).b_4}`
      : "";
  const nav = await biliFetch("https://api.bilibili.com/x/web-interface/nav", cookie);
  const img = (nav.data as { wbi_img?: { img_url: string; sub_url: string } })?.wbi_img;
  if (!img) throw new Error("获取 WBI 密钥失败（B 站接口返回异常）");
  const raw =
    img.img_url.slice(img.img_url.lastIndexOf("/") + 1).split(".")[0] +
    img.sub_url.slice(img.sub_url.lastIndexOf("/") + 1).split(".")[0];
  const key = MIXIN_KEY_ENC_TAB.slice(0, 32)
    .map((i) => raw[i])
    .join("");
  wbiCache = { key, cookie, expire: Date.now() + 30 * 60 * 1000 };
  return wbiCache;
}

function wbiSign(params: Record<string, string | number>, wbiKey: string): string {
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    filtered[k] = String(v).replace(/[!'()*]/g, "");
  }
  filtered.wts = String(Math.floor(Date.now() / 1000));
  const query = Object.keys(filtered)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(filtered[k])}`)
    .join("&");
  const wRid = createHash("md5").update(query + wbiKey).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

async function wbiGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const attempt = async (force: boolean): Promise<BiliApi<unknown>> => {
    const { key, cookie } = await getWbi(force);
    return biliFetch(`https://api.bilibili.com${path}?${wbiSign(params, key)}`, cookie);
  };
  let data: BiliApi<unknown>;
  try {
    data = await attempt(false);
  } catch (err) {
    // HTTP 412（临时封锁）等：换一组全新游客 Cookie 重试一次
    if (err instanceof Error && /HTTP 41[23]/.test(err.message)) {
      data = await attempt(true);
    } else {
      throw err;
    }
  }
  if (data.code === -352) {
    // 风控校验失败：换一组全新游客 Cookie 重试一次
    data = await attempt(true);
  }
  if (data.code !== 0) throw new Error(`B 站接口错误：${data.message}（code ${data.code}）`);
  return data.data as T;
}

type BiliOwner = { mid: number; name: string; face: string };

/** 从任意 B 站链接 / UID 解析出 UP 主信息 */
async function resolveOwner(input: string): Promise<{ mid: string; owner?: BiliOwner }> {
  const raw = input.trim();
  if (/^\d+$/.test(raw)) return { mid: raw };

  let url = raw;
  if (!/^https?:\/\//i.test(raw)) url = `https://${raw}`;
  const u = new URL(url);
  const host = u.hostname.replace(/^www\.|^m\./, "");

  // 空间主页
  if (/(^|\.)bilibili\.com$|^b23\.tv$/.test(host) === false) {
    throw new Error("不是 B 站链接，请检查输入");
  }

  // 短链 b23.tv → 跟随跳转
  let target = u;
  if (host === "b23.tv") {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    target = new URL(res.url);
  }

  const mSpace = target.pathname.match(/\/(\d+)(?:\/(?:video|dynamic))?/);
  const bvid =
    target.pathname.match(/\/video\/(BV[\w]+)/)?.[1] ||
    target.searchParams.get("bvid") ||
    "";

  if (bvid) {
    // 通过视频详情接口拿到 UP 主
    const view = await biliFetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
    );
    const owner = (view.data as { owner?: BiliOwner })?.owner;
    if (!owner) throw new Error("无法从视频解析出 UP 主");
    return { mid: String(owner.mid), owner };
  }

  const m = target.pathname.match(/\/space\/(\d+)/) || mSpace;
  if (m && /^\d+$/.test(m[1])) return { mid: m[1] };
  throw new Error("支持的形式：space.bilibili.com/UID 空间链接、视频链接或直接粘贴 UID 数字");
}

type ArcRow = {
  bvid: string;
  title: string;
  pic: string;
  description: string;
  created: number;
  author: string;
};

async function arcSearch(mid: string): Promise<ArcRow[]> {
  const data = await wbiGet<{ list: { vlist: ArcRow[] } }>("/x/space/wbi/arc/search", {
    mid,
    pn: 1,
    ps: 30,
    order: "pubdate",
  });
  return data.list.vlist;
}

/** 拉取 UP 主最新投稿（按发布时间倒序，取前 30 条） */
async function fetchVideos(mid: string): Promise<FetchedVideo[]> {
  const vlist = await arcSearch(mid);
  return vlist.map((v) => {
    const pic = v.pic.startsWith("//") ? `https:${v.pic}` : v.pic;
    return {
      videoId: v.bvid,
      title: v.title.replace(/<[^>]+>/g, ""), // 标题里偶尔混入 <em> 高亮
      url: `https://www.bilibili.com/video/${v.bvid}`,
      thumbnailUrl: pic,
      description: (v.description || "").slice(0, 500),
      publishedAt: new Date(v.created * 1000),
    } satisfies FetchedVideo;
  });
}

export const bilibiliAdapter: PlatformAdapter = {
  async resolve(input) {
    const { mid, owner } = await resolveOwner(input);
    let name = owner?.name ?? "";
    let avatarUrl: string | null = owner?.face ?? null;
    if (!name) {
      // 空间链接拿不到 owner 信息时，用投稿列表第一位的 author 兜底（少一次接口调用，降低 -352 概率）
      try {
        const vlist = await arcSearch(mid);
        if (vlist[0]?.author) name = vlist[0].author;
      } catch {
        // 忽略，保持空名
      }
    }
    const channel: FetchedChannel = {
      platform: "bilibili",
      platformId: mid,
      name,
      avatarUrl,
      url: `https://space.bilibili.com/${mid}`,
    };
    return channel;
  },
  fetchVideos,
};
