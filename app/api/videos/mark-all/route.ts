import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

/** 全部标记为已看（可选按频道） */
export async function POST(req: NextRequest) {
  const { channelId, watched } = (await req.json().catch(() => ({}))) as {
    channelId?: number;
    watched?: boolean;
  };
  const target = typeof watched === "boolean" ? watched : true;
  await ensureSchema();
  await sql`
    UPDATE videos SET watched = ${target}, watched_at = ${target ? sql`now()` : sql`NULL`}
    WHERE watched = ${!target}
      ${Number.isInteger(channelId) ? sql`AND channel_id = ${channelId as number}` : sql``}
  `;
  return NextResponse.json({ ok: true });
}
