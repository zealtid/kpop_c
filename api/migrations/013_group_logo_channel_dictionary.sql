-- P2-A：组合 logo 公开媒体路径；特典通路词典可运营维护（软禁用）
ALTER TABLE idol_groups
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN idol_groups.logo_url IS '组合公开 logo 媒体路径，如 /media/logos/xxx.png；空则 C 端回退主题色/首字';

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

COMMENT ON TABLE channel_dictionary IS '特典通路词典；Admin 可增改/软禁用。CSV 校验只认 enabled=true';
COMMENT ON TABLE release_benefit_map IS '版本×通路×特典对照；CSV 导入与 Admin 单行维护写入同一张表';
