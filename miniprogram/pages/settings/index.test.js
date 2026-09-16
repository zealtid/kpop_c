/**
 * UX-A 设置页：关注管理（公开可见性已从 MP 设置去掉）
 * run: node --test miniprogram/pages/settings/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  setStorageSync() {},
  showToast() {},
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
};

global.getApp = () => ({
  globalData: { token: "t", user: null, loginState: "ok" },
});

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const api = require("../../utils/api");
const origRequest = api.request;

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

function flush() {
  return new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  navigations.length = 0;
  api.request = origRequest;
});

test("settings hosts 管理关注, gated phone bind, and no public visibility control", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const phoneBind = require("../../utils/phoneBind");
  assert.match(wxml, /管理关注/);
  assert.match(wxml, /goFollowManage/);
  assert.match(wxml, /关注管理需要先登录/);
  assert.doesNotMatch(wxml, /手机号绑定/);
  assert.equal(phoneBind.PHONE_BIND_UI_ENABLED, false);
  assert.equal(pageDef.data.phoneBindUiEnabled, false);
  const phoneBlock = wxml.match(
    /<view wx:if="\{\{phoneBindUiEnabled\}\}" class="card phone-card">[\s\S]*?<\/button>\s*<\/view>/,
  );
  assert.ok(phoneBlock, "phone-card must stay behind phoneBindUiEnabled");
  assert.match(phoneBlock[0], /open-type="getPhoneNumber"/);
  assert.match(phoneBlock[0], /绑定手机号/);
  assert.doesNotMatch(wxml.replace(phoneBlock[0], ""), /getPhoneNumber|绑定手机号|换绑手机号/);
  assert.match(js, /PHONE_BIND_UI_ENABLED/);
  assert.match(js, /\/me\/phone|phoneBind/);
  assert.doesNotMatch(wxml, /friends/);
  assert.doesNotMatch(wxml, /可见性|公开|仅自己/);
  assert.doesNotMatch(wxml, /data-v="private"|data-v="public"|setPrivacy/);
  assert.doesNotMatch(js, /setPrivacy|privacy/);
  assert.doesNotMatch(wxss, /privacy-opt/);
});

test("onGetPhoneNumber is a no-op while PHONE_BIND_UI_ENABLED is off", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({ phoneMasked: "138****8000", phoneBound: true });
  };
  const page = pageWithData({ needsLogin: false, phoneBound: false, phoneBindUiEnabled: false });
  page.onGetPhoneNumber({ detail: { code: "wx-phone-code", errMsg: "getPhoneNumber:ok" } });
  await flush();
  assert.equal(calls.filter((c) => c.url === "/me/phone").length, 0);
});

test("settings load fetches /me and never patches privacy", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: "private" });
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.needsLogin, false);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
  assert.ok(calls.some((c) => c.url === "/me"));
});

test("ME06 管理关注 is under 设置", () => {
  const page = pageWithData({});
  page.goFollowManage();
  assert.deepEqual(navigations, [{ url: "/pages/follow-manage/index" }]);
});

test("ME10 settings has no intel / lab entry", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(wxml, /情报|pages\/feed\/|pages\/schedule\/|实验室/);
  assert.doesNotMatch(js, /pages\/feed\/|pages\/schedule\/|情报/);
});

after(() => {
  api.request = origRequest;
});
