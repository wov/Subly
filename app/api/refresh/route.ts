import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/refresh";

export const maxDuration = 60;

export async function POST() {
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
