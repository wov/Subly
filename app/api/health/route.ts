import { NextResponse } from "next/server";
import { dbStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 公开诊断端点：检查数据库配置与连通性 */
export async function GET() {
  const status = await dbStatus();
  return NextResponse.json(status, { status: status.connected ? 200 : 503 });
}
