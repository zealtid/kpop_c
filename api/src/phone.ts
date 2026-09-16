import { config, mockWxLoginEnabled } from "./config.js";
import { query } from "./db.js";
import { AppError, badRequest, conflict } from "./errors.js";
import { getWxMiniAccessToken } from "./wxAccess.js";
import { getUser, publicUser } from "./auth.js";

export type PhoneBindEvent = {
  id: string;
  userId: string | null;
  actor: string;
  event: string;
  phoneMasked: string | null;
  errorCode: string | null;
  createdAt: string;
};

function iso(value: unknown) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function digitsOnly(raw: string) {
  return String(raw || "").replace(/\D/g, "");
}

/** True when the query looks like a full phone number (exact search only; OQ-P3). */
export function looksLikePhoneQuery(raw: string) {
  const q = String(raw || "").trim();
  if (!q) return false;
  const d = digitsOnly(q);
  if (d.length === 11 && d.startsWith("1")) return true;
  if (d.length === 13 && d.startsWith("86")) return true;
  if (q.startsWith("+") && d.length >= 8 && d.length <= 15) return true;
  return false;
}

/** Normalize to E.164. Default country 86 for 11-digit mainland mobiles. */
export function toE164(raw: string) {
  const q = String(raw || "").trim();
  const d = digitsOnly(q);
  if (!d) throw badRequest("手机号无效");
  if (d.length === 11 && d.startsWith("1")) return `+86${d}`;
  if (d.length === 13 && d.startsWith("86")) return `+${d}`;
  if (q.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  throw badRequest("手机号无效");
}

export function maskPhone(e164: string) {
  const d = digitsOnly(e164);
  if (d.length >= 11 && (d.startsWith("86") || d.length === 11)) {
    const local = d.length === 11 ? d : d.slice(-11);
    return `${local.slice(0, 3)}****${local.slice(-4)}`;
  }
  if (d.length >= 7) return `${d.slice(0, 2)}****${d.slice(-4)}`;
  return "****";
}

export async function writePhoneBindEvent(opts: {
  userId: string | null;
  actor?: string;
  event: "bind_success" | "bind_fail" | "rebind";
  phoneMasked?: string | null;
  errorCode?: string | null;
}) {
  await query(
    `INSERT INTO phone_bind_events (user_id, actor, event, phone_masked, error_code)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      opts.userId,
      opts.actor || "user_self",
      opts.event,
      opts.phoneMasked || null,
      opts.errorCode || null,
    ],
  );
}

type WxPhoneInfo = {
  phoneNumber?: string;
  purePhoneNumber?: string;
  countryCode?: string;
};

async function realWxPhone(code: string): Promise<WxPhoneInfo> {
  const token = await getWxMiniAccessToken();
  if (!token) {
    throw new AppError(502, "WX_PHONE_FAILED", "微信接口不可用");
  }
  const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: ac.signal,
    });
    const data = (await res.json()) as {
      errcode?: number;
      errmsg?: string;
      phone_info?: WxPhoneInfo;
    };
    if (data.errcode && data.errcode !== 0) {
      throw new AppError(401, "WX_PHONE_FAILED", "微信手机号授权失败");
    }
    if (!data.phone_info) {
      throw new AppError(401, "WX_PHONE_FAILED", "微信未返回手机号");
    }
    return data.phone_info;
  } finally {
    clearTimeout(t);
  }
}

function phoneFromWxInfo(info: WxPhoneInfo) {
  const direct = String(info.phoneNumber || "").trim();
  if (direct) return toE164(direct);
  const country = String(info.countryCode || "86").replace(/\D/g, "") || "86";
  const pure = String(info.purePhoneNumber || "").trim();
  if (!pure) throw badRequest("微信未返回手机号");
  return toE164(`+${country}${digitsOnly(pure)}`);
}

/**
 * Exchange a WeChat getPhoneNumber `code` for E.164.
 * Mock: `mock:13800138000` / `mock:+8613800138000` when mock wx login is on.
 * Never accepts a client-supplied full number as the source of truth.
 */
export async function exchangePhoneCode(codeRaw: string) {
  const code = String(codeRaw || "").trim();
  if (!code) throw badRequest("缺少手机号授权 code");

  if (mockWxLoginEnabled && code.startsWith("mock:")) {
    return toE164(code.slice("mock:".length));
  }

  if (config.wxAppId && config.wxSecret) {
    try {
      return phoneFromWxInfo(await realWxPhone(code));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, "WX_PHONE_FAILED", "微信手机号服务不可用");
    }
  }

  if (mockWxLoginEnabled) {
    throw new AppError(400, "WX_PHONE_FAILED", "开发环境请使用 mock: 手机号 code");
  }
  throw new AppError(500, "WX_NOT_CONFIGURED", "生产环境未配置 WX_APPID / WX_SECRET");
}

function isUniqueViolation(err: unknown) {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "23505");
}

export async function bindPhone(userId: string, phoneCode: string) {
  const code = String(phoneCode || "").trim();
  if (!code) {
    await writePhoneBindEvent({ userId, event: "bind_fail", errorCode: "missing_code" });
    throw badRequest("缺少手机号授权 code");
  }

  let e164: string;
  try {
    e164 = await exchangePhoneCode(code);
  } catch (err) {
    const errorCode = err instanceof AppError ? err.code : "WX_PHONE_FAILED";
    await writePhoneBindEvent({ userId, event: "bind_fail", errorCode });
    throw err;
  }

  const masked = maskPhone(e164);
  const current = await query<{ phone_e164: string | null }>(
    "SELECT phone_e164 FROM users WHERE id = $1",
    [userId],
  );
  if (!current.rows[0]) {
    await writePhoneBindEvent({ userId, event: "bind_fail", phoneMasked: masked, errorCode: "USER_GONE" });
    throw new AppError(401, "UNAUTHORIZED", "登录已过期");
  }

  const previous = current.rows[0].phone_e164 || "";
  if (previous === e164) {
    const user = await getUser(userId);
    return publicUser(user);
  }

  const taken = await query<{ id: string }>(
    "SELECT id FROM users WHERE phone_e164 = $1 AND id <> $2",
    [e164, userId],
  );
  if (taken.rows[0]) {
    await writePhoneBindEvent({
      userId,
      event: "bind_fail",
      phoneMasked: masked,
      errorCode: "PHONE_TAKEN",
    });
    throw conflict("该手机号已被其他账号绑定", "PHONE_TAKEN");
  }

  try {
    await query(
      `UPDATE users SET
         phone_e164 = $2,
         phone_masked = $3,
         phone_bound_at = now(),
         updated_at = now()
       WHERE id = $1`,
      [userId, e164, masked],
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      await writePhoneBindEvent({
        userId,
        event: "bind_fail",
        phoneMasked: masked,
        errorCode: "PHONE_TAKEN",
      });
      throw conflict("该手机号已被其他账号绑定", "PHONE_TAKEN");
    }
    throw err;
  }

  await writePhoneBindEvent({
    userId,
    event: previous ? "rebind" : "bind_success",
    phoneMasked: masked,
  });
  return publicUser(await getUser(userId));
}

export async function listPhoneBindEvents(userId: string, limit = 50) {
  const n = Math.min(100, Math.max(1, Number(limit) || 50));
  const r = await query<{
    id: string;
    user_id: string | null;
    actor: string;
    event: string;
    phone_masked: string | null;
    error_code: string | null;
    created_at: Date;
  }>(
    `SELECT id, user_id, actor, event, phone_masked, error_code, created_at
     FROM phone_bind_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, n],
  );
  return r.rows.map(
    (row): PhoneBindEvent => ({
      id: String(row.id),
      userId: row.user_id ? String(row.user_id) : null,
      actor: String(row.actor),
      event: String(row.event),
      phoneMasked: row.phone_masked == null ? null : String(row.phone_masked),
      errorCode: row.error_code == null ? null : String(row.error_code),
      createdAt: iso(row.created_at) || "",
    }),
  );
}
