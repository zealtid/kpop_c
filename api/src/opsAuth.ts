import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, isProd } from "./config.js";
import { query } from "./db.js";
import { AppError, badRequest, forbidden, unauthorized } from "./errors.js";
import { writeAuditLog } from "./audit.js";

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: SCRYPT_N }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
export const OPS_COOKIE = "ops_session";
export const OPS_ROLES = ["ops", "reviewer"] as const;
export type OpsRole = (typeof OPS_ROLES)[number];

export type OpsUser = {
  id: string;
  username: string;
  role: OpsRole;
  allowlisted: boolean;
};

export type OpsActor = {
  id: string | null;
  username: string;
  role: OpsRole;
  via: "jwt" | "token";
};

type OpsJwtPayload = {
  typ: "ops";
  sub: string;
  username: string;
  role: OpsRole;
};

declare global {
  namespace Express {
    interface Request {
      ops?: OpsActor;
    }
  }
}

const ADMIN_MENUS = [
  { id: "catalog", label: "图鉴" },
  { id: "intel", label: "情报" },
  { id: "tickets", label: "反馈/工单" },
] as const;

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isUsernameAllowlisted(username: string, rowAllowlisted: boolean): boolean {
  if (config.opsAllowlist.length > 0) return config.opsAllowlist.includes(username);
  return rowAllowlisted;
}

export function publicOpsUser(user: OpsUser) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    menus: [...ADMIN_MENUS],
  };
}

export function signOpsToken(user: OpsUser) {
  return jwt.sign(
    { typ: "ops", sub: user.id, username: user.username, role: user.role } satisfies OpsJwtPayload,
    config.jwtSecret,
    { expiresIn: "12h" },
  );
}

function opsCookieAttrs(maxAgeSec: number) {
  const secure = config.publicBaseUrl.startsWith("https") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function setOpsCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `${OPS_COOKIE}=${encodeURIComponent(token)}; ${opsCookieAttrs(12 * 3600)}`);
}

export function clearOpsCookie(res: Response) {
  res.setHeader("Set-Cookie", `${OPS_COOKIE}=; ${opsCookieAttrs(0)}`);
}

function readOpsJwt(req: Request): OpsJwtPayload | null {
  const candidates: string[] = [];
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) candidates.push(header.slice(7));
  const cookie = cookieValue(req, OPS_COOKIE);
  if (cookie) candidates.push(cookie);
  for (const raw of candidates) {
    try {
      const payload = jwt.verify(raw, config.jwtSecret) as OpsJwtPayload;
      if (payload.typ === "ops" && payload.sub) return payload;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function loadOpsUser(id: string): Promise<OpsUser | null> {
  const r = await query<{
    id: string;
    username: string;
    role: OpsRole;
    allowlisted: boolean;
  }>("SELECT id, username, role, allowlisted FROM ops_users WHERE id = $1", [id]);
  return r.rows[0] || null;
}

function attachLegacyToken(req: Request): boolean {
  const token = String(req.headers["x-admin-token"] || "");
  if (!token || token !== config.adminToken) return false;
  req.ops = { id: null, username: "x-admin-token", role: "ops", via: "token" };
  return true;
}

async function attachOpsJwt(req: Request): Promise<OpsUser | null> {
  const payload = readOpsJwt(req);
  if (!payload) return null;
  const user = await loadOpsUser(payload.sub);
  if (!user) return null;
  req.ops = { id: user.id, username: user.username, role: user.role, via: "jwt" };
  return user;
}

/** Any authenticated ops_user (ops or reviewer). Used by /admin/auth/me and logout. */
export function requireOpsSession(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const user = await attachOpsJwt(req);
      if (user) {
        if (!isUsernameAllowlisted(user.username, user.allowlisted)) {
          return next(forbidden("不在运营白名单"));
        }
        return next();
      }
      if (attachLegacyToken(req)) return next();
      next(new AppError(401, "ADMIN_UNAUTHORIZED", "管理员令牌无效"));
    } catch (err) {
      next(err);
    }
  })();
}

/**
 * Privileged admin APIs: ops role, or legacy x-admin-token (scripts / existing tests).
 * Unauthenticated → 401; reviewer / non-ops → 403 (A01).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const user = await attachOpsJwt(req);
      if (user) {
        if (!isUsernameAllowlisted(user.username, user.allowlisted)) {
          return next(forbidden("不在运营白名单"));
        }
        if (user.role !== "ops") {
          return next(forbidden("该角色无权访问运营后台"));
        }
        return next();
      }
      if (attachLegacyToken(req)) return next();
      next(new AppError(401, "ADMIN_UNAUTHORIZED", "管理员令牌无效"));
    } catch (err) {
      next(err);
    }
  })();
}

export async function loginOps(usernameRaw: string, password: string) {
  const username = String(usernameRaw || "").trim().toLowerCase();
  if (!username || !password) throw badRequest("请输入用户名和密码");

  const r = await query<{
    id: string;
    username: string;
    role: OpsRole;
    allowlisted: boolean;
    password_hash: string;
  }>(
    "SELECT id, username, role, allowlisted, password_hash FROM ops_users WHERE username = $1",
    [username],
  );
  const row = r.rows[0];
  const dummy = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const ok = await verifyPassword(password, row?.password_hash || dummy);
  if (!row || !ok) {
    throw new AppError(401, "ADMIN_UNAUTHORIZED", "用户名或密码错误");
  }
  if (!isUsernameAllowlisted(row.username, row.allowlisted)) {
    throw forbidden("不在运营白名单");
  }

  await query("UPDATE ops_users SET last_login_at = now(), updated_at = now() WHERE id = $1", [row.id]);
  const user: OpsUser = {
    id: row.id,
    username: row.username,
    role: row.role,
    allowlisted: row.allowlisted,
  };
  await writeAuditLog({
    actor: { id: user.id, username: user.username, role: user.role },
    action: "ops.login",
    entityType: "ops_user",
    entityId: user.id,
    payload: { username: user.username, role: user.role },
  });
  return { token: signOpsToken(user), user: publicOpsUser(user) };
}

export async function getOpsMe(req: Request) {
  if (req.ops?.via === "token") {
    return {
      user: {
        id: null as string | null,
        username: "x-admin-token",
        role: "ops" as const,
        menus: [...ADMIN_MENUS],
      },
      via: "token" as const,
    };
  }
  if (!req.ops?.id) throw unauthorized();
  const user = await loadOpsUser(req.ops.id);
  if (!user) throw unauthorized();
  return { user: publicOpsUser(user), via: "jwt" as const };
}

/**
 * Local/dev seed: one ops user. Production only seeds when OPS_ADMIN_USER and a
 * password/hash are explicitly provided. Never commits plaintext production passwords.
 */
export async function seedDefaultOpsUser() {
  const username = (config.opsAdminUser || (!isProd ? "ops" : "")).trim().toLowerCase();
  if (!username) return;

  const existing = await query("SELECT id FROM ops_users WHERE username = $1", [username]);
  const explicitSecret = !!(config.opsAdminPasswordHash || config.opsAdminPassword);
  if (existing.rows[0] && !explicitSecret) return;

  let passwordHash = config.opsAdminPasswordHash;
  if (!passwordHash) {
    const password = config.opsAdminPassword || (!isProd ? "ops-dev" : "");
    if (!password) return;
    passwordHash = await hashPassword(password);
  }

  const allowlisted = config.opsAllowlist.length === 0 ? true : config.opsAllowlist.includes(username);

  await query(
    `INSERT INTO ops_users (username, password_hash, role, allowlisted)
     VALUES ($1, $2, 'ops', $3)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       allowlisted = EXCLUDED.allowlisted,
       updated_at = now()`,
    [username, passwordHash, allowlisted],
  );
}
