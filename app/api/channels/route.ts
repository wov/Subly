import { NextRequest, NextResponse } from "next/server";
import { addChannel, channelCounts, listChannels } from "@/lib/refresh";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const [channels, counts] = await Promise.all([listChannels(me.id), channelCounts(me.id)]);
  const byId = new Map(counts.map((c) => [c.channel_id, c]));
  return NextResponse.json(
    channels.map((c) => ({
      ...c,
      unwatched: byId.get(c.id)?.unwatched ?? 0,
      total: byId.get(c.id)?.total ?? 0,
    }))
  );
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !url.trim()) {
    return NextResponse.json({ error: "请输入频道链接或 ID" }, { status: 400 });
  }
  try {
    const channel = await addChannel(me.id, url.trim());
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "订阅失败，请稍后重试" },
      { status: 400 }
    );
  }
}
