import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { ensureSchema, sql, typed, type User } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  await ensureSchema();
  const rows = typed<User>(await sql`
    SELECT * FROM users WHERE username = ${(username ?? "").trim()}
  `);
  const user = rows[0];
  if (!user || !verifyPassword(password ?? "", user.password_hash)) {
    return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });
  }
  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
