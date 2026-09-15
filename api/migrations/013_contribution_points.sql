-- P3 #9: 贡献积分（非现金）。投稿审核通过记分；驳回为 0。
-- 默认每张通过的图鉴投稿 +1，常量/环境变量可改。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS contribution_points INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.contribution_points IS
  '图鉴投稿审核通过累计贡献积分；驳回不计。非现金、不可提现。';

ALTER TABLE catalog_submissions
  ADD COLUMN IF NOT EXISTS points_awarded INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN catalog_submissions.points_awarded IS
  '本条投稿审核通过时实际记入的贡献积分；驳回保持 0。';

CREATE TABLE IF NOT EXISTS contribution_point_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES catalog_submissions(id) ON DELETE CASCADE,
  points INT NOT NULL CHECK (points >= 0),
  reason TEXT NOT NULL DEFAULT 'catalog_submission_approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS contribution_point_events_user_idx
  ON contribution_point_events (user_id, created_at DESC);

COMMENT ON TABLE contribution_point_events IS
  '贡献积分流水；每条通过投稿最多记一次（UNIQUE submission_id）。不含支付/会员/提现。';

-- 存量已通过投稿按默认 1 分补记，避免管理端积分为空。
INSERT INTO contribution_point_events (user_id, submission_id, points, reason)
SELECT s.user_id, s.id, 1, 'catalog_submission_approved'
FROM catalog_submissions s
WHERE s.status = 'approved'
ON CONFLICT (submission_id) DO NOTHING;

UPDATE catalog_submissions s
SET points_awarded = e.points
FROM contribution_point_events e
WHERE e.submission_id = s.id
  AND s.points_awarded = 0
  AND e.points > 0;

UPDATE users u
SET contribution_points = sub.pts
FROM (
  SELECT user_id, COALESCE(SUM(points), 0)::int AS pts
  FROM contribution_point_events
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id
  AND u.contribution_points <> sub.pts;
