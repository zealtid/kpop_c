-- MP-Collection-Home (2026-09-16)：用户为关注组合指定封面小卡（非团图标）
-- PK (user_id, group_id)；template 必须属于该团（触发器校验）。

CREATE TABLE IF NOT EXISTS user_group_covers (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS user_group_covers_template_idx
  ON user_group_covers (template_id);

COMMENT ON TABLE user_group_covers IS
  '用户为某组合指定的封面小卡（须已拥有）；列表主视觉用模板主图，禁止用团图标充封面';

CREATE OR REPLACE FUNCTION user_group_covers_template_in_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM templates t
    JOIN releases r ON r.id = t.release_id
    WHERE t.id = NEW.template_id
      AND r.group_id = NEW.group_id
  ) THEN
    RAISE EXCEPTION 'cover template does not belong to group'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_group_covers_template_in_group_trg ON user_group_covers;
CREATE TRIGGER user_group_covers_template_in_group_trg
  BEFORE INSERT OR UPDATE OF template_id, group_id
  ON user_group_covers
  FOR EACH ROW
  EXECUTE FUNCTION user_group_covers_template_in_group();
