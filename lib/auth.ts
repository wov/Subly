// 用户认证：用户名 + 密码（scrypt 哈希），DB 会话表 + httpOnly Cookie
// 仅在 Node 运行时使用（API 路由 / 服务端组件），不再依赖 Edge middleware

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSchema, sql, typed, type User } from "./db";

export const SESSION_COOKIE = "subly_session";
const SESSION_DAYS = 30;

// ---------- 密码 ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && timingSafeEqual(expected, test);
}

// ---------- 会话 ----------

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function sessionCookieOptions(maxAgeSec = SESSION_DAYS * 86400) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSec,
    path: "/",
  };
}

/** 创建会话，返回原始 token（写入 Cookie） */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${sha256(token)}, ${userId}, now() + ${SESSION_DAYS} * interval '1 day')
  `;
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
}

/** 从请求 Cookie 解析当前登录用户；未登录返回 null */
export async function getCurrentUser(): Promise<User | null> {
  await ensureSchema();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = typed<User>(await sql`
    SELECT u.* FROM users u
    JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()
  `);
  return rows[0] ?? null;
}

/** 页面守卫：未登录跳转 /login，数据库异常向上抛出由页面渲染引导页 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ---------- 注册 ----------

/** 首个注册用户继承旧版（单密码模式）的订阅与已看数据 */
export async function claimLegacyData(userId: number): Promise<void> {
  await sql`
    INSERT INTO subscriptions (user_id, channel_id)
    SELECT ${userId}, id FROM channels
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO watched (user_id, video_id)
    SELECT ${userId}, id FROM videos WHERE watched = true
    ON CONFLICT DO NOTHING
  `;
}

export async function userCount(): Promise<number> {
  const [row] = typed<{ n: number }>(await sql`SELECT COUNT(*)::int AS n FROM users`);
  return row?.n ?? 0;
}

/** 注册是否需要邀请码（设置 REGISTER_CODE 环境变量后启用） */
export function inviteCodeEnabled(): boolean {
  return Boolean(process.env.REGISTER_CODE);
}
