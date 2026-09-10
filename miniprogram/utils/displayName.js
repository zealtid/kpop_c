/**
 * 我的页展示名（UX-A / UX-A2；UX-A3 头像另存 avatarUrl，不改昵称策略）。
 *
 * 策略：
 * - 应用展示名以 GET/PATCH /me 的 nickname 为准，不另做持久化本地覆盖。
 * - 未设置（空或历史默认「收藏家」）时，只走微信昵称填充（input type=nickname），不走已废弃的用户资料拉取。
 * - 已有展示名只读，不提供手改输入或保存手改。
 * - PATCH /me 的 nickname 仅用于写入同步到的微信昵称。
 */

const FALLBACK_NICKNAME = "收藏家";
const UNSET_PLACEHOLDER = "未设置昵称";
const NICKNAME_MAX_LEN = 32;

function trimNickname(name) {
  if (name == null) return "";
  return String(name).trim();
}

function isUnsetNickname(name) {
  const n = trimNickname(name);
  return !n || n === FALLBACK_NICKNAME;
}

function displayNickname(name) {
  return isUnsetNickname(name) ? UNSET_PLACEHOLDER : trimNickname(name);
}

function normalizeNickname(name) {
  return trimNickname(name).slice(0, NICKNAME_MAX_LEN);
}

module.exports = {
  FALLBACK_NICKNAME,
  UNSET_PLACEHOLDER,
  NICKNAME_MAX_LEN,
  trimNickname,
  isUnsetNickname,
  displayNickname,
  normalizeNickname,
};
