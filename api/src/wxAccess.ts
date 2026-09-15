import { config } from "./config.js";

type TokenCache = { token: string; expiresAt: number };
const caches = new Map<string, TokenCache>();

export function isWxMiniConfigured() {
  return !!(config.wxAppId && config.wxSecret);
}

export function isWxWebJsSdkConfigured() {
  return !!(config.wxWebAppId && config.wxWebSecret);
}

async function fetchClientCredential(appId: string, secret: string): Promise<string | null> {
  const now = Date.now();
  const hit = caches.get(appId);
  if (hit && hit.expiresAt > now + 60_000) return hit.token;
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const data = (await res.json()) as { access_token?: string; expires_in?: number; errmsg?: string };
    if (!data.access_token) return null;
    caches.set(appId, {
      token: data.access_token,
      expiresAt: now + (data.expires_in || 7200) * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function getWxMiniAccessToken() {
  if (!isWxMiniConfigured()) return null;
  return fetchClientCredential(config.wxAppId, config.wxSecret);
}

export async function getWxWebAccessToken() {
  if (!isWxWebJsSdkConfigured()) return null;
  return fetchClientCredential(config.wxWebAppId, config.wxWebSecret);
}
