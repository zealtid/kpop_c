-- UGC-2b: 宫格整页投稿来源

ALTER TABLE catalog_submissions DROP CONSTRAINT IF EXISTS catalog_submissions_source_check;
ALTER TABLE catalog_submissions ADD CONSTRAINT catalog_submissions_source_check
  CHECK (source IN ('direct_submit', 'from_custom_card', 'grid_page'));

COMMENT ON CONSTRAINT catalog_submissions_source_check ON catalog_submissions IS
  'UGC-2b 增加 grid_page；Mode B 匹配入册不写本表';
