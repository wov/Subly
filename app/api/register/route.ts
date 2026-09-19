import { NextRequest, NextResponse } from "next/server";
import {
  claimLegacyData,
  createSession,
  hashPassword,
  inviteCodeEnabled,
  SESSION_COOKIE,
  sessionCookieOptions,
  userCount,
} from "@/lib/auth";
import { ensureSchema, sql, typed } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { username, password, inviteCode } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    inviteCode?: string;
  };

  const name = (username ?? "").trim();
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json({ error: "用户名长度需在 2–30 个字符之间" }, { status: 400 });
  }
  if ((password ?? "").length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (inviteCodeEnabled() && inviteCode !== process.env.REGISTER_CODE) {
    return NextResponse.json({ error: "邀请码不正确" }, { status: 403 });
  }

  await ensureSchema();
  try {
    const rows = typed<{ id: number }>(await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${name}, ${hashPassword(password as string)})
      RETURNING id
    `);
    const userId = rows[0].id;
    // 首个注册用户继承单密码时代的旧数据
    if ((await userCount()) === 1) await claimLegacyData(userId);
    const token = await createSession(userId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof Error && /duplicate key|unique constraint/i.test(err.message)) {
      return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "注册失败" },
      { status: 500 }
    );
  }
}
