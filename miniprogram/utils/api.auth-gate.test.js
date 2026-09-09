/**
 * Mini-program 401 login gate — run: node --test miniprogram/utils/api.auth-gate.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const toasts = [];
let loginCalls = 0;

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
};

global.getApp = () => ({
  globalData: { token: "" },
  login() {
    loginCalls += 1;
  },
});

const api = require("./api");

beforeEach(() => {
  toasts.length = 0;
  loginCalls = 0;
});

test("isUnauthorized detects HTTP 401", () => {
  assert.equal(api.isUnauthorized({ status: 401, message: "请先登录" }), true);
  assert.equal(api.isUnauthorized({ status: 403 }), false);
  assert.equal(api.isUnauthorized(null), false);
});

test("401 write error toasts 请先登录 and triggers login", () => {
  api.handleWriteError({ status: 401, message: "请先登录", code: "UNAUTHORIZED" });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "请先登录");
  assert.equal(loginCalls, 1);
});

test("non-401 write error does not force login", () => {
  api.handleWriteError({ status: 500, message: "服务器错误" });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "服务器错误");
  assert.equal(loginCalls, 0);
});
