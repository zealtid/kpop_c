-- UX-C：私人自定义卡选填专辑 / 特典元数据（不写入 templates）
ALTER TABLE user_custom_cards
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS benefit_name TEXT,
  ADD COLUMN IF NOT EXISTS version_label TEXT;

CREATE INDEX IF NOT EXISTS user_custom_cards_release_idx
  ON user_custom_cards(release_id)
  WHERE release_id IS NOT NULL;

COMMENT ON COLUMN user_custom_cards.release_id IS '选填：关联已选组合下的发行，仅私人元数据';
COMMENT ON COLUMN user_custom_cards.benefit_name IS '选填：特典名称（自由文本）';
COMMENT ON COLUMN user_custom_cards.version_label IS '选填：版本标注（自由文本）';
