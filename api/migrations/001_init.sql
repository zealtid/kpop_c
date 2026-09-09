-- M1 schema: catalog + collection + share + feedback + analytics
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wx_openid TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '收藏家',
  avatar_url TEXT,
  privacy TEXT NOT NULL DEFAULT 'private'
    CHECK (privacy IN ('private', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idol_groups (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  logo_color TEXT NOT NULL DEFAULT '#ff6b9d',
  scope_note TEXT,
  is_pilot BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_zh TEXT,
  released_on DATE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'album',
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  is_benefit BOOLEAN NOT NULL DEFAULT false,
  is_deprecated BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  main_image_url TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id)
);

CREATE TABLE IF NOT EXISTS user_wants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id)
);

CREATE TABLE IF NOT EXISTS user_follows (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS missing_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS share_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES idol_groups(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  template_ids UUID[] NOT NULL,
  has_qr BOOLEAN NOT NULL DEFAULT true,
  has_watermark BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_release_idx ON templates(release_id);
CREATE INDEX IF NOT EXISTS templates_status_idx ON templates(status, is_deprecated);
CREATE INDEX IF NOT EXISTS user_cards_user_idx ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS user_wants_user_idx ON user_wants(user_id);
CREATE INDEX IF NOT EXISTS analytics_name_idx ON analytics_events(name, created_at DESC);
