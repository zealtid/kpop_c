-- P2-A：组合图标公开媒体路径（icon_url；logo_url 为同值兼容列）；特典通路词典可运营维护（软禁用）
ALTER TABLE idol_groups
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS icon_url TEXT;

UPDATE idol_groups SET icon_url = logo_url WHERE icon_url IS NULL AND logo_url IS NOT NULL;
UPDATE idol_groups SET logo_url = icon_url WHERE logo_url IS NULL AND icon_url IS NOT NULL;

COMMENT ON COLUMN idol_groups.icon_url IS '组合公开图标，如 /media/logos/xxx.png；空则 C 端回退主题色/首字。JSON 字段 iconUrl（logoUrl 为同值别名）';
COMMENT ON COLUMN idol_groups.logo_url IS '兼容列，与 icon_url 同值维护';

CREATE TABLE IF NOT EXISTS channel_dictionary (
  code TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_dictionary_enabled_idx
  ON channel_dictionary (enabled, sort_order, code);

COMMENT ON TABLE channel_dictionary IS '特典通路词典；Admin CRUD / 软禁用。CSV 与 C 端特典搜索只认 enabled=true';
COMMENT ON TABLE release_benefit_map IS '版本×通路×特典对照；B2 CSV 导入写入此表';
