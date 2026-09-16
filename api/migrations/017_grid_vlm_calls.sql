-- Admin: per VLM detect call log (audit / ops). Does not replace grid_vlm_daily quota.

CREATE TABLE IF NOT EXISTS grid_vlm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  ok BOOLEAN NOT NULL,
  reason TEXT,
  detected_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  degrade TEXT,
  day DATE NOT NULL,
  meta JSONB,
  CONSTRAINT grid_vlm_calls_meta_size CHECK (meta IS NULL OR octet_length(meta::text) <= 2048)
);

CREATE INDEX IF NOT EXISTS grid_vlm_calls_day_idx ON grid_vlm_calls (day);
CREATE INDEX IF NOT EXISTS grid_vlm_calls_created_at_idx ON grid_vlm_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS grid_vlm_calls_user_created_idx ON grid_vlm_calls (user_id, created_at DESC);

COMMENT ON TABLE grid_vlm_calls IS
  'UGC-2b-VLM 每次服务端视觉检测一行；不存原图 / base64 / 方舟原文 / 密钥。jsfeat 路径不写本表。';
