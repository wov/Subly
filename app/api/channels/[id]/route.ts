import { NextRequest, NextResponse } from "next/server";
import { unsubscribe } from "@/lib/refresh";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) {
    return NextResponse.json({ error: "无效的频道 ID" }, { status: 400 });
  }
  const removed = await unsubscribe(me.id, channelId);
  if (!removed) {
    return NextResponse.json({ error: "未订阅该频道" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
