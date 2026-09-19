import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/refresh";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const result = await refreshAll();
    return NextResponse.json({ ...result, ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "刷新失败" },
      { status: 500 }
    );
  }
}
