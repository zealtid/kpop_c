/**
 * A02 session hydrate + A03 login fail Toast — run: node --test miniprogram/app.hydrate.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const APP_JS = path.join(__dirname, "app.js");
const API_JS = path.join(__dirname, "utils/api.js");
const SESSION_JS = path.join(__dirname, "utils/session.js");
const ANALYTICS_JS = path.join(__dirname, "utils/analytics.js");
const ONBOARDING_JS = path.join(__dirname, "utils/followOnboarding.js");

const storage = {};
let requests = [];
let toasts = [];
let wxLoginCalls = 0;
let appInst = null;
let meImpl;
let loginImpl;
let platform = "devtools";

function bust(file) {
  try {
    delete require.cache[require.resolve(file)];
  } catch {
    /* not loaded */
  }
}

function loadApp() {
  bust(APP_JS);
  bust(API_JS);
  bust(SESSION_JS);
  bust(ANALYTICS_JS);
  bust(ONBOARDING_JS);

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
      return { platform };
    },
    login({ success }) {
      wxLoginCalls += 1;
      success({ code: "081EPHEMERAL" });
    },
    showToast(opts) {
      toasts.push(opts);
    },
    request() {},
  };
  global.getCurrentPages = () => [];
  global.App = (def) => {
    appInst = def;
  };
  global.getApp = () => appInst;

  require("./app.js");
  const api = require("./utils/api");
  api.request = (opts) => {
    requests.push(opts);
    if (opts.url === "/me" && (!opts.method || opts.method === "GET")) return meImpl();
    if (opts.url === "/auth/wx-login") return loginImpl(opts);
    return Promise.resolve({ groups: [{ id: "g1" }] });
  };
  return appInst;
}

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  requests = [];
  toasts = [];
  wxLoginCalls = 0;
  appInst = null;
  platform = "devtools";
  meImpl = () => Promise.resolve({ id: "u1", nickname: "收藏家" });
  loginImpl = () =>
    Promise.resolve({ token: "new-jwt", user: { id: "u-new" }, mock: true });
});

after(() => {
  bust(APP_JS);
  bust(API_JS);
  bust(SESSION_JS);
  bust(ANALYTICS_JS);
  bust(ONBOARDING_JS);
});

test("cold start with valid token hydrates GET /me and skips wx.login", async () => {
  storage.token = "stored-jwt";
  storage.user = { id: "u1", nickname: "cached" };
  const app = loadApp();
  app.onLaunch();
  const ok = await app.login({ silent: true });
  assert.equal(ok, true);
  assert.equal(app.globalData.loginState, "ok");
  assert.equal(app.globalData.token, "stored-jwt");
  assert.equal(app.globalData.user.id, "u1");
  assert.equal(wxLoginCalls, 0);
  assert.equal(
    requests.some((r) => r.url === "/auth/wx-login"),
    false,
  );
  assert.equal(
    requests.some((r) => r.url === "/me"),
    true,
  );
});

test("invalid stored token re-logins with stable mock:devtools in DevTools", async () => {
  storage.token = "expired-jwt";
  meImpl = () => Promise.reject({ status: 401, message: "登录已过期" });
  const app = loadApp();
  app.onLaunch();
  const ok = await app._loginPromise;
  assert.equal(ok, true);
  assert.equal(wxLoginCalls, 0);
  const loginReq = requests.find((r) => r.url === "/auth/wx-login");
  assert.ok(loginReq);
  assert.equal(loginReq.data.code, "mock:devtools");
  assert.equal(app.globalData.token, "new-jwt");
  assert.equal(storage.mock_login_code, "mock:devtools");
});

test("no token on a real device uses wx.login code", async () => {
  platform = "ios";
  const app = loadApp();
  app.onLaunch();
  await app._loginPromise;
  assert.equal(wxLoginCalls, 1);
  const loginReq = requests.find((r) => r.url === "/auth/wx-login");
  assert.equal(loginReq.data.code, "081EPHEMERAL");
});

test("non-silent login fail shows Toast; silent fail does not", async () => {
  loginImpl = () => Promise.reject({ status: 502, message: "微信登录服务不可用" });
  const app = loadApp();
  app.onLaunch();
  const silent = await app._loginPromise;
  assert.equal(silent, false);
  assert.equal(toasts.length, 0);
  assert.equal(app.globalData.loginState, "fail");

  const explicit = await app.login();
  assert.equal(explicit, false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "微信登录服务不可用");
});

test("cardbook and mine empty states bind 重试 via loginBtnLabel", () => {
  const cardbook = fs.readFileSync(path.join(__dirname, "pages/cardbook/index.wxml"), "utf8");
  const mine = fs.readFileSync(path.join(__dirname, "pages/mine/index.wxml"), "utf8");
  assert.match(cardbook, /bindtap="doLogin">\{\{loginBtnLabel\}\}/);
  assert.match(cardbook, /loginFailed/);
  assert.match(cardbook, /去图鉴/);
  assert.match(mine, /bindtap="doLogin">\{\{loginBtnLabel\}\}/);
  assert.match(mine, /登录失败，请重试/);
});
