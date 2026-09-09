/**
 * Cardbook 401 must not recurse into login() (P0-2 guest catalog).
 * run: node --test miniprogram/pages/cardbook/index.login-retry.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

let loginCalls = 0;
let pageDef;

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  request() {},
  navigateTo() {},
  switchTab() {},
};

global.getApp = () => ({
  globalData: { token: "", loginState: "fail" },
  _loginPromise: null,
  login() {
    loginCalls += 1;
    return Promise.resolve(false);
  },
});

global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const api = require("../../utils/api");

function pageWithData(data) {
  const page = {
    data: { ...pageDef.data, ...data },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
  for (const key of Object.keys(pageDef)) {
    if (typeof pageDef[key] === "function") {
      page[key] = pageDef[key].bind(page);
    }
  }
  return page;
}

beforeEach(() => {
  loginCalls = 0;
  api.request = () => Promise.reject({ status: 401, message: "请先登录" });
});

test("cardbook 401 sets needsLogin and does not call login()", async () => {
  const page = pageWithData({});
  page.load();
  await new Promise((r) => setImmediate(r));
  assert.equal(page.data.needsLogin, true);
  assert.equal(page.data.loginFailed, true);
  assert.equal(page.data.loginBtnLabel, "重试");
  assert.equal(loginCalls, 0);
});

test("doLogin on failure keeps 重试 entry", async () => {
  const page = pageWithData({ needsLogin: true });
  page.doLogin();
  await new Promise((r) => setImmediate(r));
  assert.equal(loginCalls, 1);
  assert.equal(page.data.loginFailed, true);
  assert.equal(page.data.loginBtnLabel, "重试");
});
