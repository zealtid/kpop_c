import { gridVlmConfig } from "../config.js";
import { query } from "../db.js";
import { shanghaiDate } from "../time.js";

const memory = new Map<string, number>();

export function resetGridVlmQuotaForTests() {
  memory.clear();
}

function memKey(userId: string, day: string) {
  return `${userId}:${day}`;
}

/**
 * Increment today's VLM detect count for a user (Asia/Shanghai day).
 * Prefers the grid_vlm_daily table; falls back to process memory if DB is unavailable.
 */
export async function consumeGridVlmQuota(userId: string): Promise<{ ok: boolean; count: number; limit: number; day: string }> {
  const limit = gridVlmConfig().dailyLimit;
  const day = shanghaiDate();
  if (!userId) return { ok: true, count: 0, limit, day };
  try {
    const r = await query<{ count: number }>(
      `INSERT INTO grid_vlm_daily (user_id, day, count)
       VALUES ($1, $2::date, 1)
       ON CONFLICT (user_id, day) DO UPDATE
         SET count = grid_vlm_daily.count + 1
         WHERE grid_vlm_daily.count < $3
       RETURNING count`,
      [userId, day, limit],
    );
    if (!r.rowCount) {
      const cur = await query<{ count: number }>(
        `SELECT count FROM grid_vlm_daily WHERE user_id = $1 AND day = $2::date`,
        [userId, day],
      );
      return { ok: false, count: Number(cur.rows[0]?.count || limit), limit, day };
    }
    return { ok: true, count: Number(r.rows[0].count), limit, day };
  } catch {
    const key = memKey(userId, day);
    const current = memory.get(key) || 0;
    if (current >= limit) return { ok: false, count: current, limit, day };
    const next = current + 1;
    memory.set(key, next);
    return { ok: true, count: next, limit, day };
  }
}
