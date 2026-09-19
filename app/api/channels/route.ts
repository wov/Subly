import { NextRequest, NextResponse } from "next/server";
import { addChannel, listChannels } from "@/lib/refresh";
import { ensureSchema, sql, typed } from "@/lib/db";

export async function GET() {
  const channels = await listChannels();
  await ensureSchema();
  const counts = typed<{ channel_id: number; unwatched: number; total: number }>(await sql`
    SELECT channel_id,
           COUNT(*) FILTER (WHERE watched = false)::int AS unwatched,
           COUNT(*)::int AS total
    FROM videos GROUP BY channel_id
  `);
  const byId = new Map(counts.map((c) => [c.channel_id, c]));
  return NextResponse.json(
    channels.map((c) => ({ ...c, unwatched: byId.get(c.id)?.unwatched ?? 0, total: byId.get(c.id)?.total ?? 0 }))
  );
}

export async function POST(req: NextRequest) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !url.trim()) {
    return NextResponse.json({ error: "请输入频道链接或 ID" }, { status: 400 });
  }
  try {
    const channel = await addChannel(url.trim());
    return NextResponse.json({ ok: true, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "订阅失败，请稍后重试" },
      { status: 400 }
    );
  }
}
