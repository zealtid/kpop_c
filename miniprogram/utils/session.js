/**
 * 登录会话：冷启动水合本地 JWT、DevTools 稳定 mock openid、失败 Toast 文案。
 * 服务端 mock 会把非 `mock:` 的 wx.login code 映射成 `dev:<code>`（见 api/src/auth.ts），
 * 开发者工具每次启动的 code 都不同，必须复用 JWT 或稳定 mock code，否则会换收藏家。
 */

const TOKEN_KEY = "token";
const USER_KEY = "user";
const MOCK_CODE_KEY = "mock_login_code";
const STABLE_MOCK_CODE = "mock:devtools";
const LOGIN_FAIL_TOAST = "登录失败，请重试";

function readStoredSession() {
  return {
    token: wx.getStorageSync(TOKEN_KEY) || "",
    user: wx.getStorageSync(USER_KEY) || null,
  };
}

function persistLogin(data, code) {
  if (data && data.token) wx.setStorageSync(TOKEN_KEY, data.token);
  if (data && data.user) wx.setStorageSync(USER_KEY, data.user);
  if (data && data.mock && code) wx.setStorageSync(MOCK_CODE_KEY, code);
}

function persistUser(user) {
  if (user) wx.setStorageSync(USER_KEY, user);
}

/** 清 token/user，保留 mock_login_code，避免 DevTools 冷启动换用户。 */
function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

function readMockLoginCode() {
  return wx.getStorageSync(MOCK_CODE_KEY) || "";
}

function persistMockLoginCode(code) {
  if (code) wx.setStorageSync(MOCK_CODE_KEY, code);
}

function isDevtools() {
  try {
    if (typeof wx === "undefined" || typeof wx.getSystemInfoSync !== "function") return false;
    const info = wx.getSystemInfoSync();
    return !!(info && info.platform === "devtools");
  } catch (err) {
    return false;
  }
}

/**
 * @param {{ storedMockCode?: string, wxCode?: string, wxLoginFailed?: boolean, isDevtools?: boolean }} opts
 */
function resolveWxLoginCode(opts) {
  const storedMockCode = (opts && opts.storedMockCode) || "";
  if (storedMockCode) return storedMockCode;
  if (opts && opts.isDevtools) return STABLE_MOCK_CODE;
  if (opts && (opts.wxLoginFailed || !opts.wxCode)) return STABLE_MOCK_CODE;
  return opts.wxCode;
}

function loginFailToastTitle(err) {
  const msg = err && typeof err.message === "string" ? err.message.trim() : "";
  if (msg && msg !== "请求失败") return msg;
  return LOGIN_FAIL_TOAST;
}

function loginButtonLabel(loginFailed) {
  return loginFailed ? "重试" : "登录";
}

function shouldReloginAfterMeError(err) {
  return !!(err && err.status === 401);
}

module.exports = {
  TOKEN_KEY,
  USER_KEY,
  MOCK_CODE_KEY,
  STABLE_MOCK_CODE,
  LOGIN_FAIL_TOAST,
  readStoredSession,
  persistLogin,
  persistUser,
  clearAuth,
  readMockLoginCode,
  persistMockLoginCode,
  isDevtools,
  resolveWxLoginCode,
  loginFailToastTitle,
  loginButtonLabel,
  shouldReloginAfterMeError,
};
