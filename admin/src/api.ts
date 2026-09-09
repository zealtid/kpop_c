const TOKEN_KEY = "xingka_ops_token";

function apiBase() {
  return import.meta.env.VITE_API_BASE || "";
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
