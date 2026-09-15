import type { PoolClient } from "pg";

/** 图鉴投稿审核通过默认记 1 分；改这里或 CONTRIBUTION_POINTS_PER_APPROVED_CARD。 */
export const DEFAULT_POINTS_PER_APPROVED_CARD = 1;
export const POINT_REASON_APPROVED = "catalog_submission_approved";

export function pointsPerApprovedCard(): number {
  const raw = process.env.CONTRIBUTION_POINTS_PER_APPROVED_CARD;
  if (raw == null || String(raw).trim() === "") return DEFAULT_POINTS_PER_APPROVED_CARD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_POINTS_PER_APPROVED_CARD;
  return Math.floor(n);
}

/**
 * 在审核通过事务内记分。同一 submission_id 只记一次。
 * 驳回路径不要调用（积分为 0）。
 */
export async function awardApprovedSubmissionPoints(
  client: PoolClient,
  opts: { userId: string; submissionId: string },
): Promise<number> {
  const points = pointsPerApprovedCard();
  const inserted = await client.query(
    `INSERT INTO contribution_point_events (user_id, submission_id, points, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (submission_id) DO NOTHING
     RETURNING id`,
    [opts.userId, opts.submissionId, points, POINT_REASON_APPROVED],
  );
  if (!inserted.rowCount) return 0;
  if (points > 0) {
    await client.query(
      `UPDATE users
       SET contribution_points = contribution_points + $2, updated_at = now()
       WHERE id = $1`,
      [opts.userId, points],
    );
  }
  return points;
}
