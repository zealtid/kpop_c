import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, mockWxLoginEnabled } from "./config.js";
import { query } from "./db.js";
import { AppError, unauthorized } from "./errors.js";
import { track } from "./analytics.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; wxOpenid: string };
    }
  }
}

type JwtPayload = { sub: string; openid: string; typ?: string };

export function signToken(user: { id: string; wx_openid: string }) {
  return jwt.sign({ sub: user.id, openid: user.wx_openid } satisfies JwtPayload, config.jwtSecret, {
    expiresIn: "30d",
  });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as JwtPayload;
    if (payload.typ === "ops") return next();
    req.user = { id: payload.sub, wxOpenid: payload.openid };
  } catch {
    // ignore invalid token for guest-readable routes
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as JwtPayload;
    if (payload.typ === "ops") return next(unauthorized());
    req.user = { id: payload.sub, wxOpenid: payload.openid };
    next();
  } catch {
    next(unauthorized("登录已过期"));
  }
}

async function upsertUser(openid: string, nickname?: string) {
  const existing = await query<{
    id: string;
    wx_openid: string;
    nickname: string;
    avatar_url: string | null;
    privacy: string;
  }>("SELECT id, wx_openid, nickname, avatar_url, privacy FROM users WHERE wx_openid = $1", [openid]);
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await query<{
    id: string;
    wx_openid: string;
    nickname: string;
    avatar_url: string | null;
    privacy: string;
  }>(
    `INSERT INTO users (wx_openid, nickname) VALUES ($1, $2)
     RETURNING id, wx_openid, nickname, avatar_url, privacy`,
    [openid, nickname || "收藏家"],
  );
  return inserted.rows[0];
}

async function realWxSession(code: string) {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wxAppId);
  url.searchParams.set("secret", config.wxSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return (await res.json()) as { openid?: string; errcode?: number; errmsg?: string };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Mock 登录身份：
 * - `mock:<id>` → 稳定 openid `<id>`（DevTools 应发 `mock:devtools`）
 * - 其它 code（含微信一次性 js_code）→ `dev:<code>`，每次冷启动都会变成新用户
 * 小程序必须复用本地 JWT，或在 mock 下发送稳定 `mock:*`，不能把 ephemeral js_code 当 openid。
 */
function mockOpenid(code: string) {
  if (code.startsWith("mock:")) return code.slice(5) || "demo";
  return `dev:${code || "anon"}`;
}

export async function wxLogin(code: string) {
  if (!code) {
    await track("login_fail", { reason: "missing_code" });
    throw new AppError(400, "BAD_REQUEST", "缺少 code");
  }

  let openid: string | undefined;
  if (mockWxLoginEnabled && (code.startsWith("mock:") || !config.wxAppId || !config.wxSecret)) {
    openid = mockOpenid(code);
  } else if (config.wxAppId && config.wxSecret) {
    try {
      const session = await realWxSession(code);
      if (session.openid) openid = session.openid;
      else {
        if (mockWxLoginEnabled) openid = mockOpenid(code);
        else {
          await track("login_fail", { reason: session.errmsg || "wx_error" });
          throw new AppError(401, "WX_LOGIN_FAILED", session.errmsg || "微信登录失败");
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (mockWxLoginEnabled) openid = mockOpenid(code);
      else {
        await track("login_fail", { reason: "wx_network" });
        throw new AppError(502, "WX_LOGIN_FAILED", "微信登录服务不可用");
      }
    }
  } else {
    await track("login_fail", { reason: "wx_not_configured" });
    throw new AppError(500, "WX_NOT_CONFIGURED", "生产环境未配置 WX_APPID / WX_SECRET");
  }

  const user = await upsertUser(openid);
  await track("login_success", { mock: mockWxLoginEnabled }, user.id);
  return { token: signToken(user), user: publicUser(user), mock: mockWxLoginEnabled };
}

export function publicUser(user: {
  id: string;
  wx_openid: string;
  nickname: string;
  avatar_url: string | null;
  privacy: string;
}) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    privacy: user.privacy,
  };
}

export async function getUser(id: string) {
  const r = await query<{
    id: string;
    wx_openid: string;
    nickname: string;
    avatar_url: string | null;
    privacy: string;
  }>("SELECT id, wx_openid, nickname, avatar_url, privacy FROM users WHERE id = $1", [id]);
  if (!r.rows[0]) throw unauthorized();
  return r.rows[0];
}

export async function updateUser(
  id: string,
  patch: { nickname?: string; privacy?: string; avatarUrl?: string | null },
) {
  if (patch.privacy && patch.privacy !== "private" && patch.privacy !== "public") {
    throw new AppError(400, "BAD_REQUEST", "可见性仅支持 private 或 public");
  }
  const r = await query<{
    id: string;
    wx_openid: string;
    nickname: string;
    avatar_url: string | null;
    privacy: string;
  }>(
    `UPDATE users SET
       nickname = COALESCE($2, nickname),
       privacy = COALESCE($3, privacy),
       avatar_url = COALESCE($4, avatar_url),
       updated_at = now()
     WHERE id = $1
     RETURNING id, wx_openid, nickname, avatar_url, privacy`,
    [id, patch.nickname ?? null, patch.privacy ?? null, patch.avatarUrl ?? null],
  );
  return r.rows[0];
}
