/**
 * 密码哈希与校验。
 *
 * 用 Web Crypto 的 PBKDF2-SHA256 —— Cloudflare Workers 原生支持，
 * 不需要任何外部依赖，也不需要额外的 WASM。
 *
 * 存储格式：pbkdf2$<iterations>$<salt_base64>$<hash_base64>
 * 把参数一起存进去，以后想调高迭代次数不会让老密码失效。
 */

// Cloudflare Workers 的 Web Crypto 对 PBKDF2 迭代次数有硬上限：
//   NotSupportedError: iteration counts above 100000 are not supported
// OWASP 推荐 210000，但平台不支持。100000 是这里能用的最大值，
// 配合「只在 credentials 表有记录时才走密码登录」+ IP 限流，够用。
const ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;

function toB64(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password, salt, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_LEN_BITS,
  );
}

/** 生成哈希串 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}

/**
 * 校验密码。
 * 用定长比较避免时序侧信道。
 */
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let salt, expected;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }

  const bits = new Uint8Array(await pbkdf2(password, salt, iterations));
  if (bits.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}
