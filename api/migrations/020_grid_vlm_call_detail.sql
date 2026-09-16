-- Admin「宫格识别」详情：可存文本提示词与模型原文；仍禁止原图 / base64 / 密钥。

ALTER TABLE grid_vlm_calls
  ADD COLUMN IF NOT EXISTS prompt_text TEXT,
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS prompt_truncated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_truncated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE grid_vlm_calls DROP CONSTRAINT IF EXISTS grid_vlm_calls_meta_size;
ALTER TABLE grid_vlm_calls
  ADD CONSTRAINT grid_vlm_calls_meta_size
  CHECK (meta IS NULL OR octet_length(meta::text) <= 8192);

ALTER TABLE grid_vlm_calls DROP CONSTRAINT IF EXISTS grid_vlm_calls_prompt_size;
ALTER TABLE grid_vlm_calls
  ADD CONSTRAINT grid_vlm_calls_prompt_size
  CHECK (prompt_text IS NULL OR octet_length(prompt_text) <= 65536);

ALTER TABLE grid_vlm_calls DROP CONSTRAINT IF EXISTS grid_vlm_calls_raw_size;
ALTER TABLE grid_vlm_calls
  ADD CONSTRAINT grid_vlm_calls_raw_size
  CHECK (raw_text IS NULL OR octet_length(raw_text) <= 65536);

COMMENT ON TABLE grid_vlm_calls IS
  'UGC-2b-VLM 每次服务端视觉检测一行；可存文本提示词与模型原文（超长截断）；不存原图 / base64 / 密钥。jsfeat 路径不写本表。';

COMMENT ON COLUMN grid_vlm_calls.prompt_text IS
  '发给模型的文本提示词（不含图片 multipart）；超长截断，见 prompt_truncated。';

COMMENT ON COLUMN grid_vlm_calls.raw_text IS
  '模型返回原文（content/text，不含图片 multipart）；超长截断，见 raw_truncated。';
