import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const videoId = Number(id);
  const body = (await req.json().catch(() => ({}))) as { watched?: boolean };
  if (!Number.isInteger(videoId) || typeof body.watched !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  await ensureSchema();
  const rows = await sql`
    UPDATE videos SET watched = ${body.watched}, watched_at = ${body.watched ? sql`now()` : sql`NULL`}
    WHERE id = ${videoId} RETURNING id
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
