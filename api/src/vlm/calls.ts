import { randomUUID } from "node:crypto";
import { query } from "../db.js";
import { badRequest } from "../errors.js";
import { shanghaiDate } from "../time.js";

const MODEL_MAX = 128;
const PROVIDER_MAX = 64;
const REASON_MAX = 64;
const DEGRADE_MAX = 32;
const USER_MAX = 64;
const META_MAX_BYTES = 2048;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 90;

export type GridVlmCallInput = {
  userId?: string | null;
  provider?: string | null;
  model?: string | null;
  ok: boolean;
  reason?: string | null;
  detectedCount?: number;
  latencyMs?: number;
  degrade?: string | null;
  meta?: { boxCount?: number; confidenceAvg?: number } | null;
};

export type GridVlmCallRow = {
  id: string;
  userId: string | null;
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

function clip(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function dayText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return shanghaiDate(value);
  return String(value).slice(0, 10);
}

function intOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function sanitizeMeta(meta: GridVlmCallInput["meta"]): Record<string, number> | null {
  if (!meta || typeof meta !== "object") return null;
  const out: Record<string, number> = {};
  if (typeof meta.boxCount === "number" && Number.isFinite(meta.boxCount)) {
    out.boxCount = Math.max(0, Math.round(meta.boxCount));
  }
  if (typeof meta.confidenceAvg === "number" && Number.isFinite(meta.confidenceAvg)) {
    out.confidenceAvg = Math.round(Math.min(1, Math.max(0, meta.confidenceAvg)) * 1000) / 1000;
  }
  if (!Object.keys(out).length) return null;
  const json = JSON.stringify(out);
  if (Buffer.byteLength(json, "utf8") > META_MAX_BYTES) return null;
  return out;
}

function addShanghaiDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00+08:00`);
  d.setTime(d.getTime() + delta * 86_400_000);
  return shanghaiDate(d);
}

function defaultRange(): { from: string; to: string } {
  const to = shanghaiDate();
  return { from: addShanghaiDays(to, -(DEFAULT_RANGE_DAYS - 1)), to };
}

function parseDayParam(raw: unknown, field: string): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw badRequest(`${field} 须为 YYYY-MM-DD`);
  }
  return s;
}

export function resolveDayRange(opts?: { from?: unknown; to?: unknown }): { from: string; to: string } {
  const fallback = defaultRange();
  const from = parseDayParam(opts?.from, "from") || fallback.from;
  const to = parseDayParam(opts?.to, "to") || fallback.to;
  if (from > to) throw badRequest("from 不能晚于 to");
  const span =
    (new Date(`${to}T00:00:00+08:00`).getTime() - new Date(`${from}T00:00:00+08:00`).getTime()) /
    86_400_000;
  if (span > MAX_RANGE_DAYS) throw badRequest(`日期跨度最多 ${MAX_RANGE_DAYS} 天`);
  return { from, to };
}

function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addShanghaiDays(cur, 1);
    if (out.length > MAX_RANGE_DAYS + 1) break;
  }
  return out;
}

function emptyDay(day: string): GridVlmDayStats {
  return {
    day,
    calls: 0,
    ok: 0,
    fail: 0,
    noCards: 0,
    timeout: 0,
    quota: 0,
    avgLatencyMs: 0,
    sumDetected: 0,
  };
}

function sumDays(days: GridVlmDayStats[]): GridVlmDayStats {
  const summary = emptyDay("");
  let latencyWeighted = 0;
  for (const row of days) {
    summary.calls += row.calls;
    summary.ok += row.ok;
    summary.fail += row.fail;
    summary.noCards += row.noCards;
    summary.timeout += row.timeout;
    summary.quota += row.quota;
    summary.sumDetected += row.sumDetected;
    latencyWeighted += row.avgLatencyMs * row.calls;
  }
  summary.avgLatencyMs = summary.calls ? Math.round(latencyWeighted / summary.calls) : 0;
  return summary;
}

type CallDbRow = {
  id: string;
  user_id: string | null;
  created_at: Date | string;
  provider: string;
  model: string;
  ok: boolean;
  reason: string | null;
  detected_count: number | string;
  latency_ms: number | string;
  degrade: string | null;
  day: Date | string;
  meta: unknown;
};

function mapCall(row: CallDbRow): GridVlmCallRow {
  const meta =
    row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? (row.meta as { boxCount?: number; confidenceAvg?: number })
      : null;
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    createdAt: iso(row.created_at),
    provider: String(row.provider || ""),
    model: String(row.model || ""),
    ok: !!row.ok,
    reason: row.reason == null || row.reason === "" ? null : String(row.reason),
    detectedCount: intOrZero(row.detected_count),
    latencyMs: intOrZero(row.latency_ms),
    degrade: row.degrade == null || row.degrade === "" ? null : String(row.degrade),
    day: dayText(row.day),
    meta,
  };
}

/** Persist one VLM detect attempt. Throws on DB errors (tests). */
export async function insertGridVlmCall(input: GridVlmCallInput): Promise<GridVlmCallRow> {
  const id = randomUUID();
  const userId = clip(input.userId || "", USER_MAX) || null;
  const provider = clip(input.provider || "", PROVIDER_MAX);
  const model = clip(input.model || "", MODEL_MAX);
  const reason = input.ok ? null : clip(input.reason || "", REASON_MAX) || null;
  const degrade = clip(input.degrade || "", DEGRADE_MAX) || null;
  const detectedCount = Math.max(0, intOrZero(input.detectedCount));
  const latencyMs = Math.max(0, intOrZero(input.latencyMs));
  const day = shanghaiDate();
  const meta = sanitizeMeta(input.meta);
  const r = await query<CallDbRow>(
    `INSERT INTO grid_vlm_calls (
       id, user_id, created_at, provider, model, ok, reason,
       detected_count, latency_ms, degrade, day, meta
     ) VALUES (
       $1, $2, now(), $3, $4, $5, $6, $7, $8, $9, $10::date, $11::jsonb
     )
     RETURNING id, user_id, created_at, provider, model, ok, reason,
               detected_count, latency_ms, degrade, day, meta`,
    [
      id,
      userId,
      provider,
      model,
      !!input.ok,
      reason,
      detectedCount,
      latencyMs,
      degrade,
      day,
      meta ? JSON.stringify(meta) : null,
    ],
  );
  return mapCall(r.rows[0]);
}

/** Best-effort write: never throw into the detect path. */
export async function recordGridVlmCall(input: GridVlmCallInput): Promise<void> {
  try {
    await insertGridVlmCall(input);
  } catch {
    // 审计失败不阻断识别 / 日限 429
  }
}

type DayDbRow = {
  day: Date | string;
  calls: number | string;
  ok: number | string;
  fail: number | string;
  no_cards: number | string;
  timeout: number | string;
  quota: number | string;
  avg_latency_ms: number | string;
  sum_detected: number | string;
};

function mapDay(row: DayDbRow): GridVlmDayStats {
  return {
    day: dayText(row.day),
    calls: intOrZero(row.calls),
    ok: intOrZero(row.ok),
    fail: intOrZero(row.fail),
    noCards: intOrZero(row.no_cards),
    timeout: intOrZero(row.timeout),
    quota: intOrZero(row.quota),
    avgLatencyMs: intOrZero(row.avg_latency_ms),
    sumDetected: intOrZero(row.sum_detected),
  };
}

export async function listGridVlmStats(opts?: { from?: unknown; to?: unknown }) {
  const { from, to } = resolveDayRange(opts);
  const r = await query<DayDbRow>(
    `SELECT
       day,
       COUNT(*)::int AS calls,
       COUNT(*) FILTER (WHERE ok)::int AS ok,
       COUNT(*) FILTER (
         WHERE NOT ok AND COALESCE(reason, '') NOT IN ('no_cards', 'timeout', 'quota')
       )::int AS fail,
       COUNT(*) FILTER (WHERE reason = 'no_cards')::int AS no_cards,
       COUNT(*) FILTER (WHERE reason = 'timeout')::int AS timeout,
       COUNT(*) FILTER (WHERE reason = 'quota')::int AS quota,
       COALESCE(ROUND(AVG(latency_ms))::int, 0) AS avg_latency_ms,
       COALESCE(SUM(detected_count)::int, 0) AS sum_detected
     FROM grid_vlm_calls
     WHERE day >= $1::date AND day <= $2::date
     GROUP BY day
     ORDER BY day`,
    [from, to],
  );
  const byDay = new Map(r.rows.map((row) => [dayText(row.day), mapDay(row)]));
  const days = daysInRange(from, to).map((day) => byDay.get(day) || emptyDay(day));
  return { from, to, days, summary: sumDays(days) };
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string): { createdAt: string; id: string } {
  let decoded = "";
  try {
    decoded = Buffer.from(String(raw), "base64url").toString("utf8");
  } catch {
    throw badRequest("cursor 无效");
  }
  const i = decoded.lastIndexOf("|");
  if (i <= 0) throw badRequest("cursor 无效");
  const createdAt = decoded.slice(0, i);
  const id = decoded.slice(i + 1);
  if (!createdAt || !id) throw badRequest("cursor 无效");
  return { createdAt, id };
}

function parseOkParam(raw: unknown): boolean | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim().toLowerCase();
  if (!s) return undefined;
  if (s === "true" || s === "1" || s === "ok") return true;
  if (s === "false" || s === "0" || s === "fail") return false;
  throw badRequest("ok 须为 true 或 false");
}

export async function listGridVlmCalls(opts?: {
  from?: unknown;
  to?: unknown;
  ok?: unknown;
  reason?: unknown;
  userId?: unknown;
  limit?: unknown;
  cursor?: unknown;
  offset?: unknown;
}) {
  const { from, to } = resolveDayRange({ from: opts?.from, to: opts?.to });
  const ok = parseOkParam(opts?.ok);
  const reason = String(opts?.reason || "").trim();
  const userId = String(opts?.userId || "").trim();
  const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 50));
  const cursorRaw = String(opts?.cursor || "").trim();
  const offset = cursorRaw ? 0 : Math.max(0, Number(opts?.offset) || 0);

  const where: string[] = ["day >= $1::date", "day <= $2::date"];
  const params: unknown[] = [from, to];

  if (ok !== undefined) {
    params.push(ok);
    where.push(`ok = $${params.length}`);
  }
  if (reason) {
    params.push(reason.slice(0, REASON_MAX));
    where.push(`reason = $${params.length}`);
  }
  if (userId) {
    params.push(userId.slice(0, USER_MAX));
    where.push(`user_id = $${params.length}`);
  }

  const filterSql = where.join(" AND ");
  const count = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM grid_vlm_calls WHERE ${filterSql}`,
    params,
  );

  const pageWhere = [...where];
  const pageParams = [...params];
  if (cursorRaw) {
    const cursor = decodeCursor(cursorRaw);
    pageParams.push(cursor.createdAt, cursor.id);
    pageWhere.push(
      `(created_at, id) < ($${pageParams.length - 1}::timestamptz, $${pageParams.length}::uuid)`,
    );
  }

  pageParams.push(limit + 1);
  const limitIdx = pageParams.length;
  let sql = `SELECT id, user_id, created_at, provider, model, ok, reason,
                    detected_count, latency_ms, degrade, day, meta
             FROM grid_vlm_calls
             WHERE ${pageWhere.join(" AND ")}
             ORDER BY created_at DESC, id DESC
             LIMIT $${limitIdx}`;
  if (!cursorRaw) {
    pageParams.push(offset);
    sql += ` OFFSET $${pageParams.length}`;
  }

  const r = await query<CallDbRow>(sql, pageParams);
  const hasMore = r.rows.length > limit;
  const rows = hasMore ? r.rows.slice(0, limit) : r.rows;
  const calls = rows.map(mapCall);
  const last = calls[calls.length - 1];
  return {
    from,
    to,
    calls,
    total: Number(count.rows[0]?.n || 0),
    nextCursor: hasMore && last?.createdAt ? encodeCursor(last.createdAt, last.id) : null,
  };
}
