import { createHash } from "node:crypto";
import type { FetchedChannel, FetchedVideo, PlatformAdapter } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

// —— Cookie 工具：把多个 Cookie 串合并成一个（后者覆盖同名项）——
function mergeCookie(...sources: string[]): string {
  const jar = new Map<string, string>();
  for (const source of sources) {
    for (const pair of source.split(";").map((s) => s.trim()).filter(Boolean)) {
      const idx = pair.indexOf("=");
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** 可选环境变量：用户从浏览器复制的 B 站 Cookie（含 SESSDATA 登录态），海外服务器被 412 风控时的终极兜底 */
function withEnvCookie(cookie: string): string {
  const env = process.env.BILIBILI_COOKIE?.trim();
  return env ? mergeCookie(cookie, env) : cookie;
}

// WBI 签名所需的混淆字符表（B 站 web 端公开算法）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

type BiliApi<T> = { code: number; message: string; data: T };

let wbiCache: { key: string; cookie: string; expire: number } | null = null;

async function biliFetch(url: string, cookie?: string, timeoutMs = 12000, referer?: string) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: referer ?? "https://www.bilibili.com/",
    Accept: "application/json",
    "Accept-Language": "zh-CN,zh;q=0.9",
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

// —— dm_* 风控参数（模拟浏览器环境指纹；2026 起 wbi 网关缺失这些参数会直接 HTTP 412）——
// 算法照搬 RSSHub / yt-dlp 的公开实现
const DM_IMG_STR = Buffer.from("no webgl").toString("base64").slice(0, -2);

function gaussianInt(mean: number, std: number): number {
  const u1 = Math.max(Math.random(), 1e-9);
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.round(z0 * std + mean);
}

function dmWh(width: number, height: number): [number, number, number] {
  const seed = Math.floor(114 * Math.random());
  return [2 * width + 2 * height + 3 * seed, 4 * width - height + seed, seed];
}

function dmOf(top: number, left: number): [number, number, number] {
  const seed = Math.floor(514 * Math.random());
  return [3 * top + 2 * left + seed, 4 * top - 4 * left + 2 * seed, seed];
}

function dmVerifyParams(): Record<string, string> {
  // 鼠标轨迹采样点
  const x = Math.max(gaussianInt(1245, 5), 0);
  const y = Math.max(gaussianInt(1285, 5), 0);
  const dmImgList = JSON.stringify([
    { x: 3 * x + 2 * y, y: 4 * x - 5 * y, z: 0, timestamp: Math.max(gaussianInt(30, 5), 0), type: 0 },
  ]);
  // 页面交互指纹（两个 div 的位置/尺寸 + 视口 + 偏移）
  const p1 = dmWh(274, 601);
  const s1 = dmOf(134, 30);
  const p2 = dmWh(332, 64);
  const s2 = dmOf(1101, 338);
  const of = dmOf(0, 0);
  const b64 = (s: string) => Buffer.from(s).toString("base64").slice(0, -2);
  const dmImgInter = JSON.stringify({
    ds: [
      { t: 2, c: b64("clearfix g-search search-container"), p: [p1[0], p1[2], p1[1]], s: [s1[2], s1[0], s1[1]] },
      { t: 2, c: b64("wrapper"), p: [p2[0], p2[2], p2[1]], s: [s2[2], s2[0], s2[1]] },
    ],
    wh: dmWh(1245, 1285),
    of,
  });
  return {
    dm_img_list: dmImgList,
    dm_img_str: DM_IMG_STR,
    dm_cover_img_str: DM_IMG_STR,
    dm_img_inter: dmImgInter,
  };
}

/** 先访问一次空间视频页：激活 buvid 游客 Cookie、收集 b_nut 等额外 Cookie（绕 412 的关键一步） */
async function warmupPage(url: string, cookie: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Cookie: cookie },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const setCookies =
      (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    return setCookies.length ? mergeCookie(cookie, ...setCookies) : cookie;
  } catch {
    return cookie; // 预热失败不阻断主流程
  }
}

async function wbiGet<T>(
  path: string,
  params: Record<string, string | number>,
  opts: { referer?: string; warmup?: (cookie: string) => Promise<string> } = {}
): Promise<T> {
  const attempt = async (force: boolean): Promise<BiliApi<unknown>> => {
    const { key, cookie } = await getWbi(force);
    const warmed = opts.warmup ? await opts.warmup(cookie) : cookie;
    return biliFetch(
      `https://api.bilibili.com${path}?${wbiSign(params, key)}`,
      withEnvCookie(warmed),
      12000,
      opts.referer
    );
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
  const spaceUrl = `https://space.bilibili.com/${mid}/video?tid=0&page=1&keyword=&order=pubdate`;
  const data = await wbiGet<{ list: { vlist: ArcRow[] } }>(
    "/x/space/wbi/arc/search",
    {
      mid,
      pn: 1,
      ps: 30,
      tid: 0,
      keyword: "",
      order: "pubdate",
      platform: "web",
      web_location: 1550101,
      order_avoided: "true",
      ...dmVerifyParams(),
    },
    {
      referer: spaceUrl,
      warmup: (cookie) => warmupPage(spaceUrl, cookie),
    }
  );
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
      author: v.author,
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
