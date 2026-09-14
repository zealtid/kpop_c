-- UGC-2a / H5-1: map WeChat web OAuth to the same users row as the mini program.
-- Mini program openid ≠ website/OA openid; unionid is the stable join key when both
-- apps are bound to the same WeChat Open Platform account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wx_unionid TEXT,
  ADD COLUMN IF NOT EXISTS wx_web_openid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_wx_unionid_uidx
  ON users (wx_unionid)
  WHERE wx_unionid IS NOT NULL AND wx_unionid <> '';

CREATE UNIQUE INDEX IF NOT EXISTS users_wx_web_openid_uidx
  ON users (wx_web_openid)
  WHERE wx_web_openid IS NOT NULL AND wx_web_openid <> '';

COMMENT ON COLUMN users.wx_openid IS '小程序 openid；H5-only 用户为 web:<web_openid>';
COMMENT ON COLUMN users.wx_unionid IS '开放平台 unionid，小程序与网页授权对齐同一 user_id';
COMMENT ON COLUMN users.wx_web_openid IS '公众号/网页应用 openid（与小程序 openid 不同）';
