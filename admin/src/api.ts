/** Must stay `xingka_ops_token` — same session key as 现网 vanilla Admin. */
const TOKEN_KEY = "xingka_ops_token";

function apiBase() {
  return String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

type ApiError = { error?: { code?: string; message?: string } };

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiBase() + path, { ...init, headers, credentials: "include" });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, body: body as T };
}

export function errorMessage(body: unknown, fallback = "请求失败") {
  const msg = (body as ApiError)?.error?.message;
  return msg || fallback;
}

/** 相对媒体路径拼 API 源；线上 Admin 与 API 不同源，不能直接用 /media/...。 */
export function mediaUrl(path: string | null | undefined) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^blob:/i.test(path) || /^data:/i.test(path)) return path;
  const rel = path.startsWith("/") ? path : `/${path}`;
  return apiBase() + rel;
}

/**
 * 用运营 JWT 拉图片再转成 blob URL。
 * `<img src>` 不会带 Authorization，跨域时 ops cookie 也不会带上；待审图必须走这条路径。
 */
export async function fetchAuthedMediaObjectUrl(path: string | null | undefined) {
  if (!path) return "";
  const url = mediaUrl(path);
  if (!url) return "";
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) return "";
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return "";
    const blob = await res.blob();
    if (!blob.size) return "";
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}
