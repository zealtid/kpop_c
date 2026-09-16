-- UGC-2b-VLM: per-user daily detect quota (Asia/Shanghai calendar day)

CREATE TABLE IF NOT EXISTS grid_vlm_daily (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS grid_vlm_daily_day_idx ON grid_vlm_daily (day);
