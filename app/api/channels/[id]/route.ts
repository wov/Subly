import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) {
    return NextResponse.json({ error: "无效的频道 ID" }, { status: 400 });
  }
  await ensureSchema();
  const rows = await sql`DELETE FROM channels WHERE id = ${channelId} RETURNING id`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "频道不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
