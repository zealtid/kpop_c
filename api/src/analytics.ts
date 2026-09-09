import type { Request } from "express";
import { query } from "./db.js";

export const ANALYTICS_EVENTS = [
  "login_success",
  "login_fail",
  "follow_set",
  "catalog_search",
  "card_own_add",
  "card_own_remove",
  "card_want_add",
  "card_want_remove",
  "share_cardbook_save",
  "missing_feedback_submit",
  "tab_view",
] as const;

export type AnalyticsName = (typeof ANALYTICS_EVENTS)[number];

export async function track(
  name: AnalyticsName | string,
  payload: Record<string, unknown> = {},
  userId?: string | null,
) {
  await query(
    "INSERT INTO analytics_events (user_id, name, payload) VALUES ($1, $2, $3::jsonb)",
    [userId ?? null, name, JSON.stringify(payload)],
  );
}

export function userIdFromReq(req: Request): string | null {
  return req.user?.id ?? null;
}
