/**
 * UX-A 设置页 ME06
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

test("ME06 settings hosts privacy private|public with selected class; IA has 管理关注", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxml, /data-v="private"/);
  assert.match(wxml, /data-v="public"/);
  assert.match(wxml, /privateOn \? 'on'/);
  assert.match(wxml, /publicOn \? 'on'/);
  assert.match(wxml, /管理关注/);
  assert.match(wxml, /goFollowManage/);
  assert.doesNotMatch(wxml, /friends/);
  assert.match(wxss, /\.privacy-opt\.on/);
});

test("ME06 load and switch privacy only patches private|public", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.method === "PATCH") {
      return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: opts.data.privacy });
    }
    return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: "private" });
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.privacy, "private");
  assert.equal(page.data.privateOn, true);
  assert.equal(page.data.publicOn, false);

  page.setPrivacy({ currentTarget: { dataset: { v: "public" } } });
  await flush();
  assert.ok(calls.some((c) => c.url === "/me" && c.method === "PATCH" && c.data.privacy === "public"));
  assert.equal(page.data.privacy, "public");
  assert.equal(page.data.privateOn, false);
  assert.equal(page.data.publicOn, true);

  page.setPrivacy({ currentTarget: { dataset: { v: "friends" } } });
  assert.equal(
    calls.filter((c) => c.method === "PATCH" && c.data && c.data.privacy === "friends").length,
    0,
  );
});

test("ME06 管理关注 is under 设置", () => {
  const page = pageWithData({});
  page.goFollowManage();
  assert.deepEqual(navigations, [{ url: "/pages/follow-manage/index" }]);
});

after(() => {
  api.request = origRequest;
});
