import { badRequest } from "./errors.js";

/** Display timezone for schedule (M2 freeze). Times are stored UTC. */
export const DISPLAY_TZ = "Asia/Shanghai";

function shanghaiParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const g = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return {
    year: g("year"),
    month: g("month"),
    day: g("day"),
    hour: g("hour"),
    minute: g("minute"),
    second: g("second"),
  };
}

/** Calendar date in Asia/Shanghai, YYYY-MM-DD. */
export function shanghaiDate(date: Date = new Date()): string {
  const p = shanghaiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO-8601 local time with +08:00, e.g. 2026-09-09T18:00:00+08:00 */
export function shanghaiIso(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const p = shanghaiParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}

/** UTC range covering one Shanghai calendar day (start inclusive, end exclusive). */
export function shanghaiDayUtcRange(date: Date = new Date()): {
  start: Date;
  end: Date;
  dateShanghai: string;
} {
  const dateShanghai = shanghaiDate(date);
  const start = new Date(`${dateShanghai}T00:00:00+08:00`);
  const [y, m, d] = dateShanghai.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 36 * 3600 * 1000); // jump into next CST day
  const nextDate = shanghaiDate(next);
  const end = new Date(`${nextDate}T00:00:00+08:00`);
  return { start, end, dateShanghai };
}

export function parseUtc(value: unknown, field = "startAt"): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value || "").trim();
  if (!s) throw badRequest(`${field} 不能为空`);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} 无效（请传 ISO UTC）`);
  return d;
}
