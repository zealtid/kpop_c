/**
 * 我的页展示名（ME01–ME04）。
 *
 * 策略：
 * - 应用展示名以 GET/PATCH /me 的 nickname 为准，不另做持久化本地覆盖。
 * - 用户手改展示名会写入 /me，下次同步不会被登录静默改回（wx-login 仅在新建用户时落库）。
 * - 默认可覆盖：手改优先；点「同步微信昵称」时，若已有自定义名则确认后再覆盖。
 * - 后端历史默认「收藏家」视为未设置，不在 C 端展示。
 */

const FALLBACK_NICKNAME = "收藏家";
const UNSET_PLACEHOLDER = "点击设置昵称";
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

function shouldConfirmWxSync(currentNickname) {
  return !isUnsetNickname(currentNickname);
}

function normalizeDraft(name) {
  return trimNickname(name).slice(0, NICKNAME_MAX_LEN);
}

module.exports = {
  FALLBACK_NICKNAME,
  UNSET_PLACEHOLDER,
  NICKNAME_MAX_LEN,
  trimNickname,
  isUnsetNickname,
  displayNickname,
  shouldConfirmWxSync,
  normalizeDraft,
};
