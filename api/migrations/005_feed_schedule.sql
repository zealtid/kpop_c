-- M2-a: FeedItem + ScheduleEvent（与图鉴 catalog Event 解耦）
-- 演唱会特典卡仍走 releases.kind = concert_md；日程不使用、不创建 catalog Event 表。

CREATE TABLE IF NOT EXISTS feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  category TEXT NOT NULL DEFAULT 'official'
    CHECK (category IN ('official', 'news', 'album', 'concert', 'other')),
  trust_level TEXT NOT NULL DEFAULT 'L1'
    CHECK (trust_level IN ('L1', 'L2', 'L3')),
  canonical_url TEXT,
  published_at TIMESTAMPTZ,
  is_machine_translated BOOLEAN NOT NULL DEFAULT false,
  source_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'hidden')),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 多组合关联：关注时间线按 group_id 过滤（比 UUID[] 更易做 FK）
CREATE TABLE IF NOT EXISTS feed_item_groups (
  feed_item_id UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (feed_item_id, group_id)
);

-- 主时间线默认仅 L1；L2 仅对运营白名单用户开放
CREATE TABLE IF NOT EXISTS feed_l2_whitelist (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  timezone_note TEXT,
  kind TEXT NOT NULL
    CHECK (kind IN ('ticket_sale', 'live', 'comeback', 'fansign', 'broadcast', 'other')),
  location TEXT,
  source_url TEXT,
  trust_level TEXT NOT NULL DEFAULT 'L1'
    CHECK (trust_level IN ('L1', 'L2', 'L3')),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'hidden')),
  -- 预留给未来缺卡跳转；M2-a 不实现联动
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_items_timeline_idx
  ON feed_items (status, trust_level, featured, published_at DESC);
CREATE INDEX IF NOT EXISTS feed_item_groups_group_idx
  ON feed_item_groups (group_id);
CREATE INDEX IF NOT EXISTS schedule_events_start_idx
  ON schedule_events (start_at);
CREATE INDEX IF NOT EXISTS schedule_events_group_idx
  ON schedule_events (group_id, start_at);

COMMENT ON TABLE feed_items IS 'M2-a FeedItem；L3 与 hidden 永不进主时间线';
COMMENT ON TABLE schedule_events IS 'M2-a ScheduleEvent；时间存 UTC，展示口径 Asia/Shanghai';
COMMENT ON COLUMN schedule_events.release_id IS 'Reserved for M3 缺卡跳转; unused in M2-a';
