/**
 * UX-A 我的页 ME01–ME05
 * run: node --test miniprogram/pages/mine/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];
const toasts = [];
const modals = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  setStorageSync() {},
  showToast(opts) {
    toasts.push(opts);
  },
  showModal(opts) {
    modals.push(opts);
    return opts;
  },
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
};

let token = "t";
global.getApp = () => ({
  globalData: { token, user: null, loginState: "ok" },
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
  toasts.length = 0;
  modals.length = 0;
  token = "t";
  api.request = origRequest;
});

test("ME01–ME03 wxml: nickname fill, placeholder, no 收藏家 default, no getUserProfile, no privacy switch", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(wxml, /type="nickname"/);
  assert.match(wxml, /点击设置昵称/);
  assert.match(wxml, /同步微信昵称/);
  assert.match(wxml, /管理关注/);
  assert.match(wxml, /bindtap="goSettings"/);
  assert.doesNotMatch(wxml, /收藏家/);
  assert.doesNotMatch(wxml, /setPrivacy|data-v="private"|data-v="public"/);
  assert.doesNotMatch(js, /getUserProfile/);
  assert.doesNotMatch(wxml, /getUserProfile/);
  assert.doesNotMatch(wxml, /情报|pages\/feed\/|实验室/);
  assert.doesNotMatch(js, /pages\/feed\/|pages\/schedule\//);
});

test("ME01 load shows real nickname; ME05 follow summary + strip", async () => {
  api.request = (opts) => {
    if (opts.url === "/me") return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: "private" });
    if (opts.url === "/me/follows") {
      return Promise.resolve({
        groups: [
          { id: "h2h", nameZh: "Hearts2Hearts", logoColor: "#f00" },
          { id: "bts", nameZh: "防弹少年团", logoColor: "#00f" },
        ],
      });
    }
    return Promise.reject(new Error(opts.url));
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.displayName, "星卡用户");
  assert.equal(page.data.nicknameUnset, false);
  assert.equal(page.data.followCount, 2);
  assert.equal(page.data.followLabel, "已关注 2 个团体");
  assert.equal(page.data.followPreview.length, 2);
  assert.equal(page.data.followPreview[0].initial, "H");
});

test("ME03 empty/收藏家 and unauthorized use 点击设置昵称", async () => {
  api.request = (opts) => {
    if (opts.url === "/me") return Promise.resolve({ id: "u1", nickname: "收藏家", privacy: "private" });
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    return Promise.reject(new Error(opts.url));
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.displayName, "点击设置昵称");
  assert.equal(page.data.nicknameUnset, true);
  assert.equal(page.data.followCount, 0);

  api.request = () => {
    const err = { status: 401, message: "未登录" };
    return Promise.reject(err);
  };
  const guest = pageWithData({});
  guest.load();
  await flush();
  assert.equal(guest.data.needsLogin, true);
  assert.equal(guest.data.displayName, "点击设置昵称");
});

test("ME04 save nickname PATCHes /me; wx sync confirms when custom name exists", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.method === "PATCH") {
      return Promise.resolve({ id: "u1", nickname: opts.data.nickname, privacy: "private" });
    }
    return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: "private" });
  };
  const page = pageWithData({
    user: { id: "u1", nickname: "星卡用户" },
    draftNickname: "新名字",
    follows: [{ id: "h2h", nameZh: "Hearts2Hearts", logoColor: "#f00" }],
    followPreview: [{ id: "h2h", nameZh: "Hearts2Hearts", logoColor: "#f00", initial: "H" }],
    followCount: 1,
  });
  page.saveNickname();
  await flush();
  assert.ok(calls.some((c) => c.url === "/me" && c.method === "PATCH" && c.data.nickname === "新名字"));
  assert.equal(page.data.displayName, "新名字");
  assert.equal(page.data.followCount, 1);

  page.requestWxNicknameSync();
  assert.equal(modals.length, 1);
  assert.match(modals[0].content, /覆盖当前展示名/);
  modals[0].success({ confirm: true });
  assert.equal(page.data.editingNickname, true);
  assert.equal(page.data.nicknameFocus, true);
});

test("ME05 empty follows nudges to 管理关注; entries go to settings / follow-manage", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /还没有关注组合/);
  assert.match(wxml, /去选择关注/);
  const page = pageWithData({});
  page.goFollowManage();
  page.goSettings();
  assert.deepEqual(navigations, [
    { url: "/pages/follow-manage/index" },
    { url: "/pages/settings/index" },
  ]);
});

after(() => {
  api.request = origRequest;
});
