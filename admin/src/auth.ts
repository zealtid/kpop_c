import { computed, reactive } from "vue";
import { api, clearToken, errorMessage, getToken, setToken } from "./api";

export type Menu = { id: string; label: string };
export type OpsUser = { id: string | null; username: string; role: string; menus: Menu[] };

export const DEFAULT_MENUS: Menu[] = [
  { id: "catalog", label: "图鉴" },
  { id: "intel", label: "情报" },
  { id: "tickets", label: "反馈/工单" },
];

const state = reactive({
  user: null as OpsUser | null,
  ready: false,
  notice: "",
});

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export const authUser = computed(() => state.user);
export const authReady = computed(() => state.ready);
export const isAuthed = computed(() => !!state.user);
export const authNotice = computed(() => state.notice);

export function userMenus(): Menu[] {
  return state.user?.menus?.length ? state.user.menus : DEFAULT_MENUS;
}

export function setAuthNotice(message: string) {
  state.notice = message;
}

export async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = doHydrate().finally(() => {
    hydrated = true;
    state.ready = true;
    hydratePromise = null;
  });
  return hydratePromise;
}

async function doHydrate() {
  if (!getToken()) {
    state.user = null;
    return;
  }
  const me = await api<{ user: OpsUser }>("/admin/auth/me");
  if (me.status !== 200) {
    clearToken();
    state.user = null;
    // 403 allowlist / role: pass through backend message (same shape as 现网 error.message)
    state.notice = errorMessage(me.body, me.status === 403 ? "没有权限访问运营接口" : "请先登录");
    return;
  }
  state.user = me.body.user;
  state.notice = "";
}

/** @returns error message on failure, null on success */
export async function login(username: string, password: string): Promise<string | null> {
  const res = await api<{ token: string; user: OpsUser }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) {
    return errorMessage(res.body, "登录失败");
  }
  // 与现网一致：reviewer 可登录接口但后台未启用
  if (res.body.user.role !== "ops") {
    clearToken();
    state.user = null;
    return "该角色尚未启用运营后台（reviewer 仅预留）";
  }
  setToken(res.body.token);
  state.user = res.body.user;
  state.notice = "";
  hydrated = true;
  state.ready = true;
  return null;
}

export async function logout(): Promise<void> {
  try {
    await api("/admin/auth/logout", { method: "POST" });
  } finally {
    clearToken();
    state.user = null;
    state.notice = "";
    hydrated = true;
    state.ready = true;
  }
}
