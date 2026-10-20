import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Bilingual, Identity, Permission, Role } from "../../src/data/types.ts";
import { ROLE_PERMISSIONS, SENSITIVE_DATA_ROLES } from "../../src/data/identities.ts";
import { config } from "./config.ts";
import { sql } from "./db.ts";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
export const SESSION_COOKIE = "lisd_session";
const SESSION_HOURS = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Stateless session: base64url(JSON payload) + "." + HMAC-SHA256. No server-side session table needed.
const sign = (data: string) => createHmac("sha256", config.sessionSecret).update(data).digest("base64url");

/** `version` is the user's token_version: bumping it in the database ends every session issued before. */
export function issueSession(reply: FastifyReply, userKey: string, version = 0) {
  const payload = Buffer.from(JSON.stringify({ u: userKey, v: version, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
  reply.setCookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    maxAge: SESSION_HOURS * 3600,
  });
}

/**
 * After a correct password, a user with two-step sign-in gets this short-lived ticket instead of a session;
 * it proves the password step and is exchanged, with a code, for the session.
 */
export function issueChallenge(userKey: string, version: number): string {
  const payload = Buffer.from(JSON.stringify({ u: userKey, v: version, exp: Date.now() + 5 * 60_000, p: "2fa" })).toString("base64url");
  // Signed differently from a session, so a ticket can never be passed off as one.
  return `${payload}.${sign(`2fa.${payload}`)}`;
}

export function readChallenge(raw: string): { key: string; version: number } | null {
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(`2fa.${payload}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, v, exp, p } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; v: number; exp: number; p?: string };
    return p === "2fa" && exp > Date.now() ? { key: u, version: v } : null;
  } catch {
    return null;
  }
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function readSession(req: FastifyRequest): { key: string; version: number } | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, v, exp, p } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; v?: number; exp: number; p?: string };
    // A two-step sign-in ticket is not a session.
    return exp > Date.now() && p === undefined ? { key: u, version: v ?? 0 } : null;
  } catch {
    return null;
  }
}

export interface SessionUser extends Identity {
  canViewSensitive: boolean;
  can: (p: Permission) => boolean;
  /** Signed in with a temporary password that must be replaced before anything else. */
  mustChangePassword: boolean;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  /** The role must use two-step sign-in and this user hasn't set it up yet. */
  twoFactorSetupRequired: boolean;
}

type UserRow = { key: string; role: string; name: Bilingual; active?: boolean; must_change_password?: boolean; token_version?: number; totp_enabled?: boolean };

export function toSessionUser(row: UserRow): SessionUser {
  const role = row.role as Role;
  return {
    key: row.key,
    role,
    name: row.name,
    canViewSensitive: SENSITIVE_DATA_ROLES.has(role),
    can: (p) => ROLE_PERMISSIONS[role]?.has(p) ?? false,
    mustChangePassword: row.must_change_password ?? false,
    tokenVersion: row.token_version ?? 0,
    twoFactorEnabled: Boolean(row.totp_enabled),
    twoFactorSetupRequired: config.requireTwoFactorRoles.has(role) && !row.totp_enabled,
  };
}

/**
 * Resolves the signed-in user, or replies and returns null. The user is re-read on every request, so a
 * disabled account, a changed role, or a password change (token version bump) takes effect immediately.
 * Until a temporary password is replaced, only the routes that pass `allowPendingPassword` work.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply, opts: { allowPendingPassword?: boolean } = {}): Promise<SessionUser | null> {
  const session = readSession(req);
  const rows = session
    ? await sql<UserRow[]>`select key, role, name, active, must_change_password, token_version, totp_enabled from users where key = ${session.key}`
    : [];
  const row = rows[0];
  // A guest session stops working as soon as guest access is switched off.
  if (!row || !row.active || row.token_version !== session!.version || (row.role === "guest" && !config.allowGuest)) {
    reply.code(401).send({ error: { th: "กรุณาเข้าสู่ระบบ", en: "Please sign in" } });
    return null;
  }
  const user = toSessionUser(row);
  if (user.mustChangePassword && !opts.allowPendingPassword) {
    reply.code(403).send({ error: { th: "กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อน", en: "Change your temporary password first" }, passwordChangeRequired: true });
    return null;
  }
  if (user.twoFactorSetupRequired && !opts.allowPendingPassword) {
    reply.code(403).send({ error: { th: "บทบาทของคุณต้องตั้งค่าการยืนยันสองขั้นตอนก่อน", en: "Your role must set up two-step sign-in first" }, twoFactorSetupRequired: true });
    return null;
  }
  return user;
}
