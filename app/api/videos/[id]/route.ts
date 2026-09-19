import { NextRequest, NextResponse } from "next/server";
import { setWatched } from "@/lib/refresh";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const videoId = Number(id);
  const body = (await req.json().catch(() => ({}))) as { watched?: boolean };
  if (!Number.isInteger(videoId) || typeof body.watched !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  const ok = await setWatched(me.id, videoId, body.watched);
  if (!ok) {
    return NextResponse.json({ error: "视频不存在或不在你的订阅内" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
