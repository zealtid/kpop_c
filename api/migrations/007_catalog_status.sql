-- M2.5 OPS-1: catalog master-data status machine
-- ArtistGroup / Member gain draft|published|deprecated (existing rows stay published).
-- Release.status adds deprecated (hide equivalent). Templates keep draft|published + is_deprecated.

ALTER TABLE idol_groups
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'idol_groups' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE idol_groups DROP CONSTRAINT %I', cname);
  END LOOP;

  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'members' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', cname);
  END LOOP;

  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'releases' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE releases DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE idol_groups
  ADD CONSTRAINT idol_groups_status_check CHECK (status IN ('draft', 'published', 'deprecated'));

ALTER TABLE members
  ADD CONSTRAINT members_status_check CHECK (status IN ('draft', 'published', 'deprecated'));

ALTER TABLE releases
  ADD CONSTRAINT releases_status_check CHECK (status IN ('draft', 'published', 'deprecated'));

CREATE INDEX IF NOT EXISTS idol_groups_status_idx ON idol_groups (status);
CREATE INDEX IF NOT EXISTS members_status_idx ON members (status);
CREATE INDEX IF NOT EXISTS members_group_idx ON members (group_id);

COMMENT ON COLUMN idol_groups.status IS 'OPS-1: draft|published|deprecated；C 端只展示 published';
COMMENT ON COLUMN members.status IS 'OPS-1: draft|published|deprecated；C 端只展示 published';
COMMENT ON COLUMN releases.status IS 'OPS-1: draft|published|deprecated；演唱会特典走 kind=concert_md，无独立 Event 表';
