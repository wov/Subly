import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authEnabled, verifyPasscode } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  const token = await verifyPasscode(passcode ?? "");
  if (token === null) {
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
