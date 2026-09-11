import type { LocationQuery, Router } from "vue-router";

export const PAGE_SIZES = [20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

export function parsePage(raw: unknown, fallback = 1): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

export function parsePageSize(raw: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if ((PAGE_SIZES as readonly number[]).includes(value)) return value;
  return fallback;
}

export function parseQueryText(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
}

export function slicePage<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
}

export function maxPage(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, itemCount) / Math.max(1, pageSize)));
}

/** 把列表条件写入 URL；空值删除；page=1 省略。 */
export function patchListQuery(
  router: Router,
  current: LocationQuery,
  patch: Record<string, string | number | undefined | null>,
) {
  const query: LocationQuery = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") {
      delete query[key];
      continue;
    }
    if (key === "page" && Number(value) === 1) {
      delete query[key];
      continue;
    }
    if (key === "pageSize" && Number(value) === DEFAULT_PAGE_SIZE) {
      delete query[key];
      continue;
    }
    query[key] = String(value);
  }
  return router.replace({ query });
}
