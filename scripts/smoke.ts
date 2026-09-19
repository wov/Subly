/* 平台抓取冒烟测试：npx tsx scripts/smoke.ts */
import { youtubeAdapter } from "../lib/youtube";
import { bilibiliAdapter } from "../lib/bilibili";

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  await test("YouTube 解析 @handle", async () => {
    const ch = await youtubeAdapter.resolve("https://www.youtube.com/@mkbhd");
    console.log(`   → ${ch.platformId} ${ch.name}`);
    if (!ch.platformId.startsWith("UC")) throw new Error("解析出的频道 ID 不对");
  });

  await test("YouTube RSS 拉取视频", async () => {
    // MrBeast
    const videos = await youtubeAdapter.fetchVideos("UCX6OQ3DkcsbYNE6H8uQQuVA");
    console.log(`   → ${videos.length} 条，最新：${videos[0]?.title?.slice(0, 40)}`);
    if (videos.length === 0) throw new Error("RSS 无数据");
  });

  await test("B 站解析空间链接", async () => {
    const ch = await bilibiliAdapter.resolve("https://space.bilibili.com/220893216");
    console.log(`   → mid=${ch.platformId} ${ch.name}`);
    if (ch.platformId !== "220893216") throw new Error("UID 解析不对");
  });

  await test("B 站拉取投稿（WBI 签名）", async () => {
    const videos = await bilibiliAdapter.fetchVideos("220893216");
    console.log(`   → ${videos.length} 条，最新：${videos[0]?.title?.slice(0, 40)}`);
    if (videos.length === 0) throw new Error("投稿列表为空");
  });

  await test("B 站视频链接解析 UP 主", async () => {
    const ch = await bilibiliAdapter.resolve("https://www.bilibili.com/video/BV1GJ411x7h7");
    console.log(`   → mid=${ch.platformId} ${ch.name}`);
  });
}

main();
