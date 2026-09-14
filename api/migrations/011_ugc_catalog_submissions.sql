-- UGC-1: 白名单投稿 + 待审实体（与 templates / 私人卡分表）

ALTER TABLE idol_groups
  ADD COLUMN IF NOT EXISTS ugc_open BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN idol_groups.ugc_open IS 'UGC-1：运营维护；false 则 C 端不可提交入库';

UPDATE idol_groups SET ugc_open = true WHERE is_pilot = true;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS image_back TEXT,
  ADD COLUMN IF NOT EXISTS phash_front TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ops';

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_source_check;
ALTER TABLE templates ADD CONSTRAINT templates_source_check
  CHECK (source IN ('ops', 'user_submission'));

CREATE INDEX IF NOT EXISTS templates_phash_front_idx ON templates (phash_front)
  WHERE phash_front IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES idol_groups(id),
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  version_label TEXT,
  slot_label TEXT NOT NULL,
  channel_code TEXT,
  image_front TEXT NOT NULL,
  image_back TEXT,
  image_front_thumb TEXT,
  image_back_thumb TEXT,
  phash_front TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  reject_reason TEXT,
  source TEXT NOT NULL DEFAULT 'direct_submit'
    CHECK (source IN ('direct_submit', 'from_custom_card')),
  custom_card_id UUID REFERENCES user_custom_cards(id) ON DELETE SET NULL,
  duplicate_of_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  reviewer_id TEXT,
  reviewed_at TIMESTAMPTZ,
  result_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  agreement_accepted_at TIMESTAMPTZ,
  moderation_trace_id TEXT,
  audit_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_submissions_status_created_idx
  ON catalog_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_submissions_group_status_idx
  ON catalog_submissions (group_id, status);
CREATE INDEX IF NOT EXISTS catalog_submissions_user_created_idx
  ON catalog_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_submissions_phash_idx
  ON catalog_submissions (phash_front)
  WHERE phash_front IS NOT NULL;
CREATE INDEX IF NOT EXISTS catalog_submissions_trace_idx
  ON catalog_submissions (moderation_trace_id)
  WHERE moderation_trace_id IS NOT NULL;

COMMENT ON TABLE catalog_submissions IS 'UGC-1 入库申请；禁止用 user_custom_cards 假扮 Template';
