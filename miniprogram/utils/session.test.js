/**
 * A02/A03 session helpers — run: node --test miniprogram/utils/session.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const storage = {};

global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : "";
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  },
  getSystemInfoSync() {
    return { platform: "devtools" };
  },
};

const session = require("./session");

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
});

test("hydrate reads token and cached user from storage", () => {
  const user = { id: "u1", nickname: "收藏家" };
  wx.setStorageSync("token", "jwt-1");
  wx.setStorageSync("user", user);
  assert.deepEqual(session.readStoredSession(), { token: "jwt-1", user });
});

test("clearAuth drops token/user but keeps mock_login_code", () => {
  wx.setStorageSync("token", "jwt-1");
  wx.setStorageSync("user", { id: "u1" });
  wx.setStorageSync("mock_login_code", "mock:devtools");
  session.clearAuth();
  assert.equal(wx.getStorageSync("token"), "");
  assert.equal(wx.getStorageSync("user"), "");
  assert.equal(wx.getStorageSync("mock_login_code"), "mock:devtools");
});

test("persistLogin stores token, user, and mock code only when mock", () => {
  session.persistLogin({ token: "t", user: { id: "u1" }, mock: true }, "mock:devtools");
  assert.equal(wx.getStorageSync("token"), "t");
  assert.deepEqual(wx.getStorageSync("user"), { id: "u1" });
  assert.equal(wx.getStorageSync("mock_login_code"), "mock:devtools");

  for (const key of Object.keys(storage)) delete storage[key];
  session.persistLogin({ token: "t2", user: { id: "u2" }, mock: false }, "081XYZ");
  assert.equal(wx.getStorageSync("token"), "t2");
  assert.equal(wx.getStorageSync("mock_login_code"), "");
});

test("DevTools and stored mock code beat ephemeral wx.login code", () => {
  assert.equal(
    session.resolveWxLoginCode({ storedMockCode: "mock:devtools", wxCode: "081NEW", isDevtools: false }),
    "mock:devtools",
  );
  assert.equal(session.resolveWxLoginCode({ wxCode: "081NEW", isDevtools: true }), "mock:devtools");
  assert.equal(session.resolveWxLoginCode({ wxCode: "081NEW", isDevtools: false }), "081NEW");
  assert.equal(session.resolveWxLoginCode({ wxLoginFailed: true, isDevtools: false }), "mock:devtools");
});

test("expired GET /me should re-login; network errors should not", () => {
  assert.equal(session.shouldReloginAfterMeError({ status: 401 }), true);
  assert.equal(session.shouldReloginAfterMeError({ status: 500 }), false);
  assert.equal(session.shouldReloginAfterMeError({ code: "NETWORK" }), false);
});

test("non-silent login fail toast and retry label", () => {
  assert.equal(session.loginFailToastTitle({ message: "微信登录失败" }), "微信登录失败");
  assert.equal(session.loginFailToastTitle({ message: "请求失败" }), "登录失败，请重试");
  assert.equal(session.loginFailToastTitle(null), "登录失败，请重试");
  assert.equal(session.loginButtonLabel(false), "登录");
  assert.equal(session.loginButtonLabel(true), "重试");
});
