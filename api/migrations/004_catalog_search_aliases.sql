-- PR-P1-3 / C02: 图鉴搜索覆盖韩文名 + 轻量别名
-- members 原先无 name_ko；组合/成员/发行用逗号分隔 aliases 供 ILIKE
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS name_ko TEXT NOT NULL DEFAULT '';

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS aliases TEXT NOT NULL DEFAULT '';

ALTER TABLE idol_groups
  ADD COLUMN IF NOT EXISTS aliases TEXT NOT NULL DEFAULT '';

ALTER TABLE releases
  ADD COLUMN IF NOT EXISTS aliases TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN members.name_ko IS '成员韩文名，供图鉴搜索（C02）';
COMMENT ON COLUMN members.aliases IS '成员别名（逗号分隔），如 柾国，供图鉴搜索';
COMMENT ON COLUMN idol_groups.aliases IS '组合别名（逗号分隔），供图鉴搜索';
COMMENT ON COLUMN releases.aliases IS '专辑/发行别名（逗号分隔），供图鉴搜索';
