import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, mockWxLoginEnabled, mockWxWebLoginEnabled } from "./config.js";
import { originFromPublicUrl } from "./cors.js";
import { query } from "./db.js";
import { AppError, badRequest, unauthorized } from "./errors.js";
import { track } from "./analytics.js";
import { parseImagePayload, saveCustomImage } from "./storage.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; wxOpenid: string };
    }
  }
}

type JwtPayload = { sub: string; openid: string; typ?: string };
type WxWebState = { typ: "wx-web"; returnTo?: string };

type UserRow = {
  id: string;
  wx_openid: string;
  wx_unionid: string | null;
  wx_web_openid: string | null;
  nickname: string;
  avatar_url: string | null;
  privacy: string;
  contribution_points?: number | string | null;
};

const USER_COLUMNS =
  "id, wx_openid, wx_unionid, wx_web_openid, nickname, avatar_url, privacy, contribution_points";

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

async function loadUserById(id: string) {
  const r = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

/**
 * Resolve the same `users.id` across mini program and H5.
 * Prefer unionid (Open Platform binding). Fall back to channel-specific openid.
 * Web-only rows store `wx_openid = web:<webOpenid>` so the NOT NULL unique column stays valid.
 */
export async function upsertWeChatUser(opts: {
  channel: "mini" | "web";
  openid: string;
  unionId?: string | null;
  webOpenid?: string | null;
  nickname?: string;
}) {
  const unionId = String(opts.unionId || "").trim() || null;
  const webOpenid = String(opts.webOpenid || "").trim() || null;
  const openid = String(opts.openid || "").trim();
  if (!openid) throw badRequest("缺少 openid");

  if (unionId) {
    const byUnion = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE wx_unionid = $1`, [unionId]);
    if (byUnion.rows[0]) {
      const u = byUnion.rows[0];
      if (opts.channel === "mini" && u.wx_openid.startsWith("web:")) {
        await query(
          `UPDATE users SET wx_openid = $2, wx_unionid = $3, updated_at = now() WHERE id = $1`,
          [u.id, openid, unionId],
        );
      } else if (opts.channel === "web" && webOpenid && u.wx_web_openid !== webOpenid) {
        await query(
          `UPDATE users SET wx_web_openid = $2, wx_unionid = COALESCE(wx_unionid, $3), updated_at = now() WHERE id = $1`,
          [u.id, webOpenid, unionId],
        );
      } else if (!u.wx_unionid) {
        await query(`UPDATE users SET wx_unionid = $2, updated_at = now() WHERE id = $1`, [u.id, unionId]);
      }
      return (await loadUserById(u.id))!;
    }
  }

  if (opts.channel === "mini") {
    const existing = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE wx_openid = $1`, [openid]);
    if (existing.rows[0]) {
      if (unionId && !existing.rows[0].wx_unionid) {
        await query(`UPDATE users SET wx_unionid = $2, updated_at = now() WHERE id = $1`, [
          existing.rows[0].id,
          unionId,
        ]);
      }
      return (await loadUserById(existing.rows[0].id))!;
    }
  }

  if (webOpenid) {
    const existing = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE wx_web_openid = $1`, [webOpenid]);
    if (existing.rows[0]) {
      if (unionId && !existing.rows[0].wx_unionid) {
        await query(`UPDATE users SET wx_unionid = $2, updated_at = now() WHERE id = $1`, [
          existing.rows[0].id,
          unionId,
        ]);
      }
      return (await loadUserById(existing.rows[0].id))!;
    }
  }

  const wxOpenid = opts.channel === "web" ? `web:${webOpenid || openid}` : openid;
  const inserted = await query<UserRow>(
    `INSERT INTO users (wx_openid, wx_web_openid, wx_unionid, nickname)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_COLUMNS}`,
    [wxOpenid, webOpenid, unionId, opts.nickname || "收藏家"],
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
    return (await res.json()) as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
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

export async function wxLogin(code: string, extra?: { unionId?: string }) {
  if (!code) {
    await track("login_fail", { reason: "missing_code" });
    throw new AppError(400, "BAD_REQUEST", "缺少 code");
  }

  let openid: string | undefined;
  let unionId: string | undefined = mockWxLoginEnabled ? String(extra?.unionId || "").trim() || undefined : undefined;
  if (mockWxLoginEnabled && (code.startsWith("mock:") || !config.wxAppId || !config.wxSecret)) {
    openid = mockOpenid(code);
  } else if (config.wxAppId && config.wxSecret) {
    try {
      const session = await realWxSession(code);
      if (session.openid) {
        openid = session.openid;
        if (session.unionid) unionId = session.unionid;
      } else {
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

  const user = await upsertWeChatUser({ channel: "mini", openid, unionId });
  await track("login_success", { mock: mockWxLoginEnabled }, user.id);
  return { token: signToken(user), user: publicUser(user), mock: mockWxLoginEnabled };
}

function mockWebOpenid(code: string) {
  if (code.startsWith("mock:web:")) return code.slice("mock:web:".length) || "h5";
  if (code.startsWith("mock:")) return `web-${code.slice(5) || "h5"}`;
  return `dev-web:${code || "anon"}`;
}

async function realWxWebSession(code: string) {
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", config.wxWebAppId);
  url.searchParams.set("secret", config.wxWebSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return (await res.json()) as {
      openid?: string;
      unionid?: string;
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    };
  } finally {
    clearTimeout(t);
  }
}

export async function wxWebLogin(code: string, extra?: { unionId?: string }) {
  if (!code) {
    await track("login_fail", { reason: "missing_web_code" });
    throw new AppError(400, "BAD_REQUEST", "缺少 code");
  }

  let webOpenid: string | undefined;
  let unionId: string | undefined = mockWxWebLoginEnabled
    ? String(extra?.unionId || "").trim() || undefined
    : undefined;

  if (mockWxWebLoginEnabled && (code.startsWith("mock:") || !config.wxWebAppId || !config.wxWebSecret)) {
    webOpenid = mockWebOpenid(code);
  } else if (config.wxWebAppId && config.wxWebSecret) {
    try {
      const session = await realWxWebSession(code);
      if (session.openid) {
        webOpenid = session.openid;
        if (session.unionid) unionId = session.unionid;
      } else {
        if (mockWxWebLoginEnabled) webOpenid = mockWebOpenid(code);
        else {
          await track("login_fail", { reason: session.errmsg || "wx_web_error" });
          throw new AppError(401, "WX_LOGIN_FAILED", session.errmsg || "微信网页授权失败");
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (mockWxWebLoginEnabled) webOpenid = mockWebOpenid(code);
      else {
        await track("login_fail", { reason: "wx_web_network" });
        throw new AppError(502, "WX_LOGIN_FAILED", "微信网页授权不可用");
      }
    }
  } else {
    await track("login_fail", { reason: "wx_web_not_configured" });
    throw new AppError(500, "WX_NOT_CONFIGURED", "未配置 WX_WEB_APPID / WX_WEB_SECRET");
  }

  const user = await upsertWeChatUser({
    channel: "web",
    openid: `web:${webOpenid}`,
    webOpenid,
    unionId,
  });
  await track("login_success", { mock: mockWxWebLoginEnabled, channel: "web" }, user.id);
  return { token: signToken(user), user: publicUser(user), mock: mockWxWebLoginEnabled, channel: "web" as const };
}

export function signWxWebState(returnTo?: string) {
  return jwt.sign({ typ: "wx-web", returnTo: returnTo || "" } satisfies WxWebState, config.jwtSecret, {
    expiresIn: "10m",
  });
}

export function readWxWebState(state: string): WxWebState {
  try {
    const payload = jwt.verify(state, config.jwtSecret) as WxWebState;
    if (payload.typ !== "wx-web") throw new Error("bad typ");
    return payload;
  } catch {
    throw badRequest("授权状态已过期，请重试");
  }
}

export function isSafeH5ReturnTo(returnTo: string | undefined | null): string {
  const raw = String(returnTo || "").trim();
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  const h5Origin = originFromPublicUrl(config.h5PublicUrl);
  try {
    const url = new URL(raw);
    const origin = url.origin;
    if (h5Origin && origin === h5Origin) return `${url.pathname}${url.search}${url.hash}` || "/";
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    /* ignore */
  }
  return "/";
}

export function wxWebAuthorizeUrl(returnTo?: string) {
  const state = signWxWebState(isSafeH5ReturnTo(returnTo));
  const redirectUri =
    config.wxWebRedirectUri || `${config.publicBaseUrl.replace(/\/$/, "")}/auth/wx-web/callback`;
  if (mockWxWebLoginEnabled && (!config.wxWebAppId || !config.wxWebSecret)) {
    const cb = new URL(redirectUri, config.publicBaseUrl);
    cb.searchParams.set("code", "mock:web:devtools");
    cb.searchParams.set("state", state);
    return cb.toString();
  }
  if (!config.wxWebAppId) {
    throw new AppError(500, "WX_NOT_CONFIGURED", "未配置 WX_WEB_APPID");
  }
  const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
  url.searchParams.set("appid", config.wxWebAppId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_base");
  url.searchParams.set("state", state);
  return `${url.toString()}#wechat_redirect`;
}

export function h5AuthReturnUrl(token: string, returnTo?: string) {
  const next = isSafeH5ReturnTo(returnTo);
  const base = (config.h5PublicUrl || config.publicBaseUrl).replace(/\/$/, "");
  const hash = `#/auth?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  return `${base}/${hash}`;
}

export function publicUser(user: {
  id: string;
  wx_openid: string;
  nickname: string;
  avatar_url: string | null;
  privacy: string;
  contribution_points?: number | string | null;
}) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    privacy: user.privacy,
    contributionPoints: Number(user.contribution_points) || 0,
  };
}

export async function getUser(id: string) {
  const r = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  if (!r.rows[0]) throw unauthorized();
  return r.rows[0];
}

/** 拒绝微信临时路径入库；仅接受 /media/... 或 http(s) 持久地址。 */
export function assertPersistableAvatarUrl(url: string) {
  const raw = String(url).trim();
  if (!raw) throw badRequest("头像地址无效");
  if (/^wxfile:\/\//i.test(raw) || /^https?:\/\/tmp\b/i.test(raw)) {
    throw badRequest("头像需先上传");
  }
  if (raw.startsWith("/media/") || /^https?:\/\//i.test(raw)) return raw;
  throw badRequest("头像地址无效");
}

/** 复用自定义卡图片落盘（S3 / 本地 /media/custom），返回公开相对路径。 */
export async function saveUserAvatar(userId: string, base64?: string, mimeType?: string) {
  if (!base64 || !String(base64).trim()) throw badRequest("请上传头像");
  const parsed = parseImagePayload({ base64: String(base64), mimeType });
  const saved = await saveCustomImage({
    userId,
    id: randomUUID(),
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    side: "front",
  });
  return saved.publicPath;
}

export async function updateUser(
  id: string,
  patch: { nickname?: string; privacy?: string; avatarUrl?: string | null },
) {
  if (patch.privacy && patch.privacy !== "private" && patch.privacy !== "public") {
    throw new AppError(400, "BAD_REQUEST", "可见性仅支持 private 或 public");
  }
  const avatarUrl = patch.avatarUrl ? assertPersistableAvatarUrl(patch.avatarUrl) : null;
  const r = await query<UserRow>(
    `UPDATE users SET
       nickname = COALESCE($2, nickname),
       privacy = COALESCE($3, privacy),
       avatar_url = COALESCE($4, avatar_url),
       updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id, patch.nickname ?? null, patch.privacy ?? null, avatarUrl],
  );
  return r.rows[0];
}
