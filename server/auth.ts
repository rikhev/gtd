import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { db, DATA_DIR } from "./db.ts";

/**
 * Single-owner login: password (scrypt) + TOTP code, or a one-time recovery code.
 * Sessions are random tokens in an HttpOnly cookie; only their SHA-256 is stored.
 * Auth is on in production and whenever GTD_AUTH=1; local development stays open.
 */

export const AUTH_FILE = `${DATA_DIR}/auth.json`;
const COOKIE = "gtd_session";
const SESSION_DAYS = 30;

export const authRequired = () => process.env.GTD_AUTH === "1" || (process.env.NODE_ENV === "production" && process.env.GTD_AUTH !== "0");

interface AuthFile {
  passwordHash: string; // scrypt$N$r$p$salt$hash (base64)
  totpSecret: string; // base32
  recoveryHashes: string[]; // sha256 hex of unused recovery codes
  lastTotpStep: number;
  createdAt: string;
}

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  last_seen TEXT NOT NULL, ip TEXT, user_agent TEXT
)`);

/* ---------------- storage ---------------- */

export function readAuth(): AuthFile | null {
  if (!existsSync(AUTH_FILE)) return null;
  return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as AuthFile;
}

export function writeAuth(a: AuthFile) {
  writeFileSync(AUTH_FILE, JSON.stringify(a, null, 2), { mode: 0o600 });
  chmodSync(AUTH_FILE, 0o600);
}

/* ---------------- password ---------------- */

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [, N, r, p, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(pw.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/* ---------------- TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ---------------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Returns the matched time step (±1 step of clock drift), or null. */
export function verifyTotp(secretB32: string, code: string, notBefore: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= notBefore) continue; // each code works once
    const a = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(a, Buffer.from(code))) return s;
  }
  return null;
}

export function totpUri(secret: string, account = "owner") {
  return `otpauth://totp/In-Tray:${encodeURIComponent(account)}?secret=${secret}&issuer=In-Tray&algorithm=SHA1&digits=6&period=30`;
}

/* ---------------- recovery codes ---------------- */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const normRecovery = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function newRecoveryCodes(n = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: n }, () => {
    const raw = randomBytes(6).toString("hex"); // 12 hex chars
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(normRecovery(c))) };
}

/* ---------------- sessions ---------------- */

function clientIp(c: Context): string {
  const remote = getConnInfo(c).remote.address ?? "";
  // Trust X-Forwarded-For only from the local reverse proxy.
  if (remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1") {
    const fwd = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0];
    if (fwd) return fwd.trim();
  }
  return remote;
}

const isSecure = (c: Context) => c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";

function createSession(c: Context) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token_hash, created_at, expires_at, last_seen, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)").run(
    sha256(token),
    now.toISOString(),
    expires.toISOString(),
    now.toISOString(),
    clientIp(c),
    (c.req.header("user-agent") ?? "").slice(0, 200),
  );
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

function validSession(c: Context): boolean {
  const token = getCookie(c, COOKIE);
  if (!token) return false;
  const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as { expires_at: string } | undefined;
  if (!row) return false;
  if (row.expires_at < new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    return false;
  }
  db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(new Date().toISOString(), sha256(token));
  return true;
}

export function revokeAllSessions() {
  db.exec("DELETE FROM sessions");
}

/* ---------------- rate limiting ---------------- */

const WINDOW_MS = 15 * 60_000;
const PER_IP = 5;
const GLOBAL = 30;
const failures = new Map<string, number[]>();
let globalFailures: number[] = [];

function recent(list: number[]) {
  const cut = Date.now() - WINDOW_MS;
  return list.filter((t) => t > cut);
}

function lockedFor(ip: string): number {
  const list = recent(failures.get(ip) ?? []);
  globalFailures = recent(globalFailures);
  if (list.length >= PER_IP) return Math.ceil((list[0] + WINDOW_MS - Date.now()) / 60_000);
  if (globalFailures.length >= GLOBAL) return Math.ceil((globalFailures[0] + WINDOW_MS - Date.now()) / 60_000);
  return 0;
}

function recordFailure(ip: string) {
  failures.set(ip, [...recent(failures.get(ip) ?? []), Date.now()]);
  globalFailures = [...recent(globalFailures), Date.now()];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- routes + middleware ---------------- */

export async function login(c: Context) {
  const ip = clientIp(c);
  const wait = lockedFor(ip);
  if (wait) return c.json({ ok: false, error: `Too many attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` }, 429);

  const auth = readAuth();
  if (!auth) return c.json({ ok: false, error: "Login isn't set up on the server yet. Run npm run auth:setup there." }, 503);

  const { password = "", code = "" } = ((await c.req.json().catch(() => ({}))) ?? {}) as { password?: string; code?: string };
  const passOk = typeof password === "string" && password.length <= 1024 && verifyPassword(password, auth.passwordHash);
  let secondOk = false;
  let usedRecovery = false;
  if (passOk) {
    const clean = String(code).replace(/\s/g, "");
    const step = verifyTotp(auth.totpSecret, clean, auth.lastTotpStep);
    if (step !== null) {
      auth.lastTotpStep = step;
      secondOk = true;
    } else {
      const h = sha256(normRecovery(String(code)));
      if (auth.recoveryHashes.includes(h)) {
        auth.recoveryHashes = auth.recoveryHashes.filter((x) => x !== h);
        secondOk = usedRecovery = true;
      }
    }
  }
  if (!passOk || !secondOk) {
    recordFailure(ip);
    console.warn(`[auth] failed login from ${ip}`);
    await sleep(600);
    return c.json({ ok: false, error: "Wrong password or code." }, 401);
  }
  writeAuth(auth);
  failures.delete(ip);
  createSession(c);
  console.log(`[auth] login from ${ip}${usedRecovery ? " (recovery code)" : ""}`);
  return c.json({ ok: true, recoveryLeft: usedRecovery ? auth.recoveryHashes.length : undefined });
}

export function logout(c: Context, everywhere = false) {
  const token = getCookie(c, COOKIE);
  if (everywhere) revokeAllSessions();
  else if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  deleteCookie(c, COOKIE, { path: "/", secure: isSecure(c), sameSite: "Strict" });
  return c.json({ ok: true });
}

export function me(c: Context) {
  return c.json({ required: authRequired(), signedIn: !authRequired() || validSession(c), configured: Boolean(readAuth()) });
}

/** Security headers everywhere; session + same-origin checks on the API. */
export const guard: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/") && authRequired()) {
    // Cross-site writes are refused outright (the cookie is SameSite=Strict too).
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      if (origin && host && new URL(origin).host !== host) return c.json({ error: "Cross-site request refused" }, 403);
    }
    if (!path.startsWith("/api/auth/") && !validSession(c)) return c.json({ error: "Sign in required" }, 401);
  }
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  }
};

/** Periodic cleanup of expired sessions. */
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()), 3600_000).unref();
