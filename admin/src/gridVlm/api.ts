import { api, errorMessage } from "../api";

export type GridVlmDayStats = {
  day: string;
  calls: number;
  ok: number;
  fail: number;
  noCards: number;
  timeout: number;
  quota: number;
  avgLatencyMs: number;
  sumDetected: number;
};

export type GridVlmCall = {
  id: string;
  userId: string | null;
  userDisplayName: string | null;
  createdAt: string | null;
  provider: string;
  model: string;
  ok: boolean;
  reason: string | null;
  detectedCount: number;
  latencyMs: number;
  degrade: string | null;
  day: string;
  meta: { boxCount?: number; confidenceAvg?: number } | null;
};

export type GridVlmCallDetail = GridVlmCall & {
  promptText: string | null;
  rawText: string | null;
  promptTruncated: boolean;
  rawTruncated: boolean;
};

function denied(status: number, body: unknown) {
  return errorMessage(body, status === 403 ? "没有权限访问运营接口" : "请求失败");
}

export async function getGridVlmStats(opts?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (opts?.from) qs.set("from", opts.from);
  if (opts?.to) qs.set("to", opts.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await api<{
    from: string;
    to: string;
    days: GridVlmDayStats[];
    summary: GridVlmDayStats;
  }>(`/admin/grid-vlm/stats${suffix}`);
  if (res.status !== 200) {
    return {
      ok: false as const,
      status: res.status,
      message: denied(res.status, res.body),
    };
  }
  return {
    ok: true as const,
    from: res.body.from,
    to: res.body.to,
    days: res.body.days || [],
    summary: res.body.summary,
  };
}

export async function listGridVlmCalls(opts?: {
  from?: string;
  to?: string;
  ok?: string;
  reason?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}) {
  const qs = new URLSearchParams();
  if (opts?.from) qs.set("from", opts.from);
  if (opts?.to) qs.set("to", opts.to);
  if (opts?.ok) qs.set("ok", opts.ok);
  if (opts?.reason) qs.set("reason", opts.reason);
  if (opts?.userId) qs.set("userId", opts.userId);
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.offset != null) qs.set("offset", String(opts.offset));
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await api<{
    calls: GridVlmCall[];
    total: number;
    nextCursor: string | null;
  }>(`/admin/grid-vlm/calls${suffix}`);
  if (res.status !== 200) {
    return {
      ok: false as const,
      status: res.status,
      message: denied(res.status, res.body),
      calls: [] as GridVlmCall[],
      total: 0,
      nextCursor: null as string | null,
    };
  }
  return {
    ok: true as const,
    calls: res.body.calls || [],
    total: res.body.total || 0,
    nextCursor: res.body.nextCursor || null,
  };
}

export async function getGridVlmCall(id: string) {
  const res = await api<GridVlmCallDetail>(`/admin/grid-vlm/calls/${encodeURIComponent(id)}`);
  if (res.status !== 200) {
    return {
      ok: false as const,
      status: res.status,
      message: denied(res.status, res.body),
    };
  }
  return { ok: true as const, call: res.body };
}

export function shortUserId(userId: string | null | undefined) {
  if (!userId) return "";
  return userId.length > 8 ? userId.slice(0, 8) : userId;
}

export function callUserLabel(row: { userDisplayName?: string | null; userId?: string | null }) {
  const name = String(row.userDisplayName || "").trim();
  if (name) return name;
  if (row.userId) return "（无昵称）";
  return "—";
}

export function formatCallTime(iso: string | null | undefined) {
  if (!iso) return "";
  return String(iso).replace("T", " ").replace(/\.\d+Z$/, "").slice(0, 19);
}

export const VLM_REASON_LABELS: Record<string, string> = {
  timeout: "超时",
  vlm_fail: "识别失败",
  vlm_unconfigured: "未配置",
  no_cards: "未检出",
  quota: "日限",
};

export function reasonLabel(reason: string | null | undefined, ok?: boolean) {
  if (ok) return "成功";
  if (!reason) return "失败";
  return VLM_REASON_LABELS[reason] || reason;
}

export function shanghaiYmd(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

export function addShanghaiDays(ymd: string, delta: number) {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  d.setTime(d.getTime() + delta * 86_400_000);
  return shanghaiYmd(d);
}

export function defaultStatsRange(): { from: string; to: string } {
  const to = shanghaiYmd();
  return { from: addShanghaiDays(to, -6), to };
}

export function successRate(ok: number, calls: number) {
  if (!calls) return "—";
  return `${Math.round((ok / calls) * 1000) / 10}%`;
}

export const emptyDayStats = (): GridVlmDayStats => ({
  day: "",
  calls: 0,
  ok: 0,
  fail: 0,
  noCards: 0,
  timeout: 0,
  quota: 0,
  avgLatencyMs: 0,
  sumDetected: 0,
});
