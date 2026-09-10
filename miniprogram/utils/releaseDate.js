/**
 * 图鉴发行日展示（ME08–ME09）。
 *
 * 链路：
 * - `GET /catalog/groups/:id` 的 `listReleases` 返回原始行 `released_on`（PG DATE）。
 * - Express `res.json` 把 Date 序列化成 ISO UTC：常见为当天 00:00Z，
 *   或上海 00:00 对应的前一日 16:00Z。不能对带 Z 的串直接 slice(0,10)。
 * - 已是 `YYYY-MM-DD` 的日历串按字面使用，不再当 UTC 午夜解析。
 * - 带时区的时间戳按 Asia/Shanghai 取日历日。缺省 / Invalid Date →「—」，不抛错。
 */

const MISSING = "—";
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function fromInstant(d) {
  if (!d || Number.isNaN(d.getTime())) return MISSING;
  const t = new Date(d.getTime() + SHANGHAI_OFFSET_MS);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function formatReleasedOn(value) {
  if (value == null || value === "") return MISSING;
  if (value instanceof Date) return fromInstant(value);

  const s = String(value).trim();
  if (!s || s === "Invalid Date") return MISSING;

  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return ymd(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));

  // 无时区的本地午夜，按日历日，避免设备时区把 00:00 推到前一天
  const naiveMidnight = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]00:00:00(?:\.0+)?$/);
  if (naiveMidnight) {
    return ymd(Number(naiveMidnight[1]), Number(naiveMidnight[2]), Number(naiveMidnight[3]));
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return MISSING;
  return fromInstant(d);
}

function decorateRelease(release) {
  const src = release || {};
  const raw = Object.prototype.hasOwnProperty.call(src, "releasedOn") ? src.releasedOn : src.released_on;
  const next = Object.assign({}, src);
  next.releasedOnLabel = formatReleasedOn(raw);
  return next;
}

module.exports = {
  MISSING,
  DISPLAY_TZ: "Asia/Shanghai",
  formatReleasedOn,
  decorateRelease,
};
