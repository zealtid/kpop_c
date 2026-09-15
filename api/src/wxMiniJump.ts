import { createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
import {
  getWxMiniAccessToken,
  getWxWebAccessToken,
  isWxMiniConfigured,
  isWxWebJsSdkConfigured,
} from "./wxAccess.js";

export type MiniJump = {
  appId: string | null;
  ghId: string | null;
  urlScheme: string | null;
  urlLink: string | null;
  canJump: boolean;
  jsSdk: boolean;
  missing: string[];
  reason: string;
};

type JumpCache = { expiresAt: number; value: Pick<MiniJump, "urlScheme" | "urlLink" | "reason"> };
const jumpCache = new Map<string, JumpCache>();

type TicketCache = { ticket: string; expiresAt: number };
let jsapiTicket: TicketCache | null = null;

function splitMiniPath(page: string, query: string) {
  const raw = String(page || "").replace(/^\//, "");
  const qIndex = raw.indexOf("?");
  const pathOnly = (qIndex >= 0 ? raw.slice(0, qIndex) : raw) || "pages/catalog/index";
  const fromPage = qIndex >= 0 ? raw.slice(qIndex + 1) : "";
  const q = String(query || fromPage).replace(/^\?/, "");
  return { path: pathOnly, query: q };
}

export function jumpMissingConfig(): string[] {
  const missing: string[] = [];
  if (!isWxMiniConfigured() && !config.wxUrlScheme) {
    if (!config.wxAppId) missing.push("WX_APPID");
    if (!config.wxSecret) missing.push("WX_SECRET");
    if (!config.wxUrlScheme) missing.push("WX_URL_SCHEME");
  }
  return missing;
}

async function wxPost(url: string, body: unknown) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    return (await res.json()) as {
      errcode?: number;
      errmsg?: string;
      openlink?: string;
      url_link?: string;
    };
  } finally {
    clearTimeout(t);
  }
}

async function generateFromWeChat(page: string, query: string) {
  const token = await getWxMiniAccessToken();
  if (!token) {
    return { urlScheme: null as string | null, urlLink: null as string | null, reason: "wx_token_failed" };
  }
  const jump = { path: page, query, env_version: "release" };
  const tokenQs = encodeURIComponent(token);
  const [link, scheme] = await Promise.all([
    wxPost(`https://api.weixin.qq.com/wxa/generate_urllink?access_token=${tokenQs}`, {
      path: page,
      query,
      expire_type: 1,
      expire_interval: 30,
    }),
    wxPost(`https://api.weixin.qq.com/wxa/generatescheme?access_token=${tokenQs}`, {
      jump_wxa: jump,
      expire_type: 1,
      expire_interval: 30,
    }),
  ]);

  let urlLink: string | null = null;
  let urlScheme: string | null = null;
  let reason = "ok";
  if (link.url_link && (!link.errcode || link.errcode === 0)) urlLink = link.url_link;
  else if (link.errcode) reason = link.errmsg || `urllink_${link.errcode}`;
  if (scheme.openlink && (!scheme.errcode || scheme.errcode === 0)) urlScheme = scheme.openlink;
  else if (!urlLink && scheme.errcode) reason = scheme.errmsg || `scheme_${scheme.errcode}`;
  if (urlLink || urlScheme) reason = urlLink ? "urllink" : "scheme";
  return { urlScheme, urlLink, reason };
}

export async function resolveMiniJump(input: { page?: string; query?: string; path?: string }): Promise<MiniJump> {
  const parsed = splitMiniPath(input.page || input.path || "pages/catalog/index", input.query || "");
  const missing = jumpMissingConfig();
  const staticScheme = config.wxUrlScheme || null;
  const base: MiniJump = {
    appId: config.wxAppId || null,
    ghId: config.wxMiniGhId || null,
    urlScheme: staticScheme,
    urlLink: null,
    canJump: false,
    jsSdk: isWxWebJsSdkConfigured() && !!config.wxMiniGhId,
    missing,
    reason: "not_configured",
  };

  const cacheKey = `${parsed.path}?${parsed.query}`;
  const now = Date.now();
  const cached = jumpCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    const urlScheme = cached.value.urlScheme || staticScheme;
    const urlLink = cached.value.urlLink;
    return {
      ...base,
      urlScheme,
      urlLink,
      canJump: !!(urlLink || urlScheme || base.jsSdk),
      reason: cached.value.reason,
    };
  }

  if (isWxMiniConfigured()) {
    try {
      const generated = await generateFromWeChat(parsed.path, parsed.query);
      jumpCache.set(cacheKey, {
        expiresAt: now + (generated.urlLink || generated.urlScheme ? 6 * 3600_000 : 60_000),
        value: generated,
      });
      const urlScheme = generated.urlScheme || staticScheme;
      return {
        ...base,
        urlScheme,
        urlLink: generated.urlLink,
        canJump: !!(generated.urlLink || urlScheme || base.jsSdk),
        reason: generated.reason,
      };
    } catch {
      jumpCache.set(cacheKey, {
        expiresAt: now + 60_000,
        value: { urlScheme: staticScheme, urlLink: null, reason: "wx_network" },
      });
    }
  }

  return {
    ...base,
    canJump: !!(staticScheme || base.jsSdk),
    reason: staticScheme ? "static_scheme" : isWxMiniConfigured() ? "wx_network" : "missing_wx_secret",
  };
}

export async function jsSdkSignature(pageUrl: string) {
  if (!isWxWebJsSdkConfigured()) {
    return {
      configured: false as const,
      missing: ["WX_WEB_APPID", "WX_WEB_SECRET"].filter((k) =>
        k === "WX_WEB_APPID" ? !config.wxWebAppId : !config.wxWebSecret,
      ),
    };
  }
  const token = await getWxWebAccessToken();
  if (!token) return { configured: false as const, missing: [] as string[], reason: "wx_web_token_failed" };
  const now = Date.now();
  if (!jsapiTicket || jsapiTicket.expiresAt <= now + 60_000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(
        `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(token)}&type=jsapi`,
        { signal: ac.signal },
      );
      const data = (await res.json()) as { ticket?: string; expires_in?: number; errmsg?: string };
      if (!data.ticket) return { configured: false as const, missing: [] as string[], reason: data.errmsg || "no_ticket" };
      jsapiTicket = { ticket: data.ticket, expiresAt: now + (data.expires_in || 7200) * 1000 };
    } catch {
      return { configured: false as const, missing: [] as string[], reason: "wx_network" };
    } finally {
      clearTimeout(t);
    }
  }
  const nonceStr = randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const url = String(pageUrl || "").split("#")[0];
  const plain = `jsapi_ticket=${jsapiTicket.ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = createHash("sha1").update(plain).digest("hex");
  return {
    configured: true as const,
    appId: config.wxWebAppId,
    timestamp,
    nonceStr,
    signature,
    ghId: config.wxMiniGhId || null,
  };
}
