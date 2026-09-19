// 认证采用“访问密码 + HMAC Cookie”，兼容 Edge Runtime（middleware）与 Node（API 路由）

export const AUTH_COOKIE = "subly_auth";

export function authEnabled(): boolean {
  return Boolean(process.env.AUTH_PASSCODE);
}

async function hmacHex(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.AUTH_PASSCODE ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 校验访问密码；成功返回应写入 Cookie 的令牌 */
export async function verifyPasscode(passcode: string): Promise<string | null> {
  if (!authEnabled()) return "";
  if (passcode !== process.env.AUTH_PASSCODE) return null;
  return hmacHex("subly-auth-v1");
}

/** 校验请求携带的 Cookie 令牌 */
export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!token) return false;
  const expected = await hmacHex("subly-auth-v1");
  // 常量时间比较，避免时序侧信道
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
