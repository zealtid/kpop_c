-- 刀 A：版本×通路×特典对照（只读落库，不创建/发布 Template）
CREATE TABLE IF NOT EXISTS release_benefit_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  channel_code TEXT NOT NULL,
  benefit_name_zh TEXT NOT NULL,
  maps_to_slot_labels TEXT,
  map_mode TEXT NOT NULL CHECK (map_mode IN ('slots', 'benefit_only')),
  evidence_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('drafting', 'confirmed', 'retired')),
  benefit_batch TEXT,
  benefit_type TEXT,
  member_scope TEXT,
  version_label_for_template TEXT,
  tags_hint TEXT,
  notes TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by TEXT,
  UNIQUE (release_id, version_label, channel_code, benefit_name_zh)
);

CREATE INDEX IF NOT EXISTS release_benefit_map_release_idx ON release_benefit_map (release_id);
CREATE INDEX IF NOT EXISTS release_benefit_map_group_idx ON release_benefit_map (group_id);

COMMENT ON TABLE release_benefit_map IS '运营 Sheet 校验通过的 confirmed 特典对照；Admin 只读，不自动 published 无图 Template';
