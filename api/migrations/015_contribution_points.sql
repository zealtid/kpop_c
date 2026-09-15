-- P3 / OQ-P3-1…3: 贡献积分（非现金）。投稿首次审核通过记 1 分；驳回为 0。
-- 不回填历史上已经 approved 的投稿（OQ-P3-2）。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS contribution_points INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.contribution_points IS
  '图鉴投稿首次审核通过累计贡献积分（OQ-P3-1 默认 +1）；驳回不计。非现金、不可提现。不回填历史通过记录。';

ALTER TABLE catalog_submissions
  ADD COLUMN IF NOT EXISTS points_awarded INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN catalog_submissions.points_awarded IS
  '本条投稿首次通过时实际记入的贡献积分；驳回与历史存量通过保持 0。';

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
  '贡献积分流水；按 submission_id 幂等（UNIQUE）。合并已有模板的通过同样记分（OQ-P3-3）。不含支付/会员/商城/封禁。';
