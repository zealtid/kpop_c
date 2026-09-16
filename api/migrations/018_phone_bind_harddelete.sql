-- P3-Phone / P3-HardDelete (2026-09-16 开闸)
-- 手机号绑定（登录仍微信）+ 绑定审计 + Admin 硬删所需 GC 队列。

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS phone_masked TEXT,
  ADD COLUMN IF NOT EXISTS phone_bound_at TIMESTAMPTZ;

COMMENT ON COLUMN users.phone_e164 IS 'E.164 手机号；C 端登录仍走微信，本列不是登录凭证';
COMMENT ON COLUMN users.phone_masked IS '展示用脱敏号（如 138****5678）；Admin 默认只看此列';

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_uidx
  ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL AND phone_e164 <> '';

CREATE TABLE IF NOT EXISTS phone_bind_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT 'user_self',
  event TEXT NOT NULL CHECK (event IN ('bind_success', 'bind_fail', 'rebind')),
  phone_masked TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_bind_events_user_idx
  ON phone_bind_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_bind_events_created_idx
  ON phone_bind_events (created_at DESC);

COMMENT ON TABLE phone_bind_events IS
  '手机号绑定审计；只存脱敏号。硬删用户后 user_id 置空，明细匿名保留。';

CREATE TABLE IF NOT EXISTS object_gc_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_path TEXT NOT NULL,
  reason TEXT NOT NULL,
  user_id UUID,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS object_gc_queue_pending_idx
  ON object_gc_queue (queued_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE object_gc_queue IS
  '用户硬删后的对象存储异步 GC（OQ-D1）；不删已发布图鉴 /media/cards 资产';
