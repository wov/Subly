import { NextRequest, NextResponse } from "next/server";
import { refreshAll } from "@/lib/refresh";

export const maxDuration = 60;

/** Vercel Cron 每小时调用；用 CRON_SECRET 校验（Vercel 会带 Authorization: Bearer <secret>） */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
  }
  const result = await refreshAll();
  return NextResponse.json({ ...result, ok: true });
}
