import { config } from "./config.js";
import { query } from "./db.js";

export const MODERATION_PENDING = "pending";
export const MODERATION_APPROVED = "approved";
export const MODERATION_REJECTED = "rejected";

export type ModerationStatus = "pending" | "approved" | "rejected";

type WxTokenCache = { token: string; expiresAt: number };
let tokenCache: WxTokenCache | null = null;

export function isWxModerationConfigured() {
  return !!(config.wxAppId && config.wxSecret);
}

async function fetchAccessToken() {
  if (!isWxModerationConfigured()) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", config.wxAppId);
  url.searchParams.set("secret", config.wxSecret);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const data = (await res.json()) as { access_token?: string; expires_in?: number; errmsg?: string };
    if (!data.access_token) return null;
    tokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in || 7200) * 1000,
    };
    return tokenCache.token;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 提交微信 mediaCheckAsync。未配置 WX_SECRET 时保持 pending，并返回 ready:true 表示钩子可用。
 */
export async function submitMediaCheckAsync(opts: {
  mediaUrl: string;
  openid: string;
}): Promise<{ submitted: boolean; traceId?: string; reason: string; hookReady: boolean }> {
  if (!isWxModerationConfigured()) {
    return { submitted: false, reason: "wx_not_configured", hookReady: true };
  }
  const token = await fetchAccessToken();
  if (!token) {
    return { submitted: false, reason: "wx_token_failed", hookReady: true };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.weixin.qq.com/wxa/media_check_async?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_url: opts.mediaUrl,
          media_type: 2,
          version: 2,
          scene: 1,
          openid: opts.openid,
        }),
        signal: ac.signal,
      },
    );
    const data = (await res.json()) as { errcode?: number; trace_id?: string; errmsg?: string };
    if (data.errcode && data.errcode !== 0) {
      return { submitted: false, reason: data.errmsg || `wx_${data.errcode}`, hookReady: true };
    }
    if (!data.trace_id) {
      return { submitted: false, reason: "wx_no_trace", hookReady: true };
    }
    return { submitted: true, traceId: data.trace_id, reason: "submitted", hookReady: true };
  } catch {
    return { submitted: false, reason: "wx_network", hookReady: true };
  } finally {
    clearTimeout(t);
  }
}

export function suggestToStatus(suggest: string | undefined | null): ModerationStatus {
  const s = String(suggest || "").toLowerCase();
  if (s === "pass") return "approved";
  if (s === "risky" || s === "block" || s === "reject") return "rejected";
  return "pending";
}

export async function applyMediaCheckResult(opts: {
  traceId?: string;
  suggest?: string;
  customCardId?: string;
}) {
  const status = suggestToStatus(opts.suggest);
  if (opts.traceId) {
    const r = await query(
      `UPDATE user_custom_cards
       SET moderation_status = $2, updated_at = now()
       WHERE moderation_trace_id = $1
       RETURNING id, moderation_status`,
      [opts.traceId, status],
    );
    return r.rows[0] || null;
  }
  if (opts.customCardId) {
    const r = await query(
      `UPDATE user_custom_cards
       SET moderation_status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, moderation_status`,
      [opts.customCardId, status],
    );
    return r.rows[0] || null;
  }
  return null;
}
