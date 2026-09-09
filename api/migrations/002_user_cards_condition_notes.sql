-- PR-P1-4 / O06: user_cards 单卡编辑字段（品相 + 备注）
-- quantity 已在 001_init；撤销仍为 DELETE 行，禁止 qty=0
ALTER TABLE user_cards
  ADD COLUMN IF NOT EXISTS condition TEXT
    CHECK (condition IS NULL OR condition IN (
      'mint',
      'near_mint',
      'excellent',
      'good',
      'poor'
    )),
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN user_cards.condition IS '品相：mint 全新 / near_mint 近全新 / excellent 优秀 / good 良好 / poor 较差；可空';
COMMENT ON COLUMN user_cards.notes IS '备注，可空';
