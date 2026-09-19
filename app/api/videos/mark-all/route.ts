import { NextRequest, NextResponse } from "next/server";
import { markAllWatched } from "@/lib/refresh";
import { getCurrentUser } from "@/lib/auth";

/** 全部标记为已看（可选按频道） */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { channelId } = (await req.json().catch(() => ({}))) as { channelId?: number };
  await markAllWatched(me.id, Number.isInteger(channelId) ? channelId : undefined);
  return NextResponse.json({ ok: true });
}
