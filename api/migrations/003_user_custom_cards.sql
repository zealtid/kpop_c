-- M1.5 私人拍照加卡：独立 UserCustomCard，禁止写入 templates
CREATE TABLE IF NOT EXISTS user_custom_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_front TEXT NOT NULL,
  image_back TEXT,
  group_id UUID REFERENCES idol_groups(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  title TEXT,
  note TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  condition TEXT CHECK (condition IS NULL OR condition IN (
    'mint',
    'near_mint',
    'excellent',
    'good',
    'poor'
  )),
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderation_trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_custom_cards_user_idx ON user_custom_cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_custom_cards_group_idx ON user_custom_cards(group_id);
CREATE INDEX IF NOT EXISTS user_custom_cards_trace_idx ON user_custom_cards(moderation_trace_id)
  WHERE moderation_trace_id IS NOT NULL;

COMMENT ON TABLE user_custom_cards IS '用户私人拍照加卡，不进入公开图鉴，不计入官方进度';
COMMENT ON COLUMN user_custom_cards.moderation_status IS 'pending 审核中 / approved 通过 / rejected 未通过';
COMMENT ON COLUMN user_custom_cards.condition IS '品相：与 user_cards.condition 对齐';

ALTER TABLE share_images
  ADD COLUMN IF NOT EXISTS custom_card_ids UUID[] NOT NULL DEFAULT '{}';
