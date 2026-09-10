/**
 * UX-A / UX-A2 / UX-A3 我的页：资料卡头像+昵称同排，昵称仅同步微信
 * run: node --test miniprogram/pages/mine/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];
const toasts = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  setStorageSync() {},
  showToast(opts) {
    toasts.push(opts);
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
  token = "t";
  api.request = origRequest;
});

test("UX-A3 wxml: avatar+nickname row; nickname fill only; no getUserProfile; action list kept", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxml, /class="profile-row"/);
  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /bindchooseavatar="onChooseAvatar"/);
  assert.match(wxml, /wx:if="\{\{hasAvatar\}\}"/);
  assert.match(wxml, /class="avatar-ph"/);
  assert.match(wxml, /class="profile-name/);
  assert.match(wxss, /\.profile-row/);
  assert.match(wxss, /align-items:\s*center/);
  assert.match(wxml, /type="nickname"/);
  assert.match(wxml, /同步微信昵称/);
  assert.match(wxml, /wx:if="\{\{nicknameUnset\}\}"/);
  assert.match(wxml, /bindblur="onWxNicknameFill"/);
  assert.match(wxml, /管理关注/);
  assert.match(wxml, /bindtap="goSettings"/);
  assert.doesNotMatch(wxml, /收藏家/);
  assert.doesNotMatch(wxml, /点击设置昵称|点击修改/);
  assert.doesNotMatch(wxml, /saveNickname|openNicknameEditor|requestWxNicknameSync/);
  assert.doesNotMatch(wxml, /catchtap="saveNickname"|placeholder="点击设置昵称"/);
  assert.doesNotMatch(js, /getUserProfile/);
  assert.doesNotMatch(js, /saveNickname|openNicknameEditor|onNicknameInput|editingNickname|draftNickname/);
  assert.doesNotMatch(wxml, /getUserProfile/);
  assert.doesNotMatch(wxml, /setPrivacy|data-v="private"|data-v="public"/);
  assert.doesNotMatch(wxml, /情报|pages\/feed\/|实验室/);
  assert.doesNotMatch(js, /pages\/feed\/|pages\/schedule\//);
  assert.match(wxml, /action-list/);
  assert.match(wxml, /action-row/);
  assert.match(wxml, /文字反馈缺卡/);
  assert.match(wxml, /关于星卡/);
  assert.match(wxss, /\.action-row/);
  assert.match(wxss, /min-height:\s*104rpx/);
  assert.doesNotMatch(wxml, /class="btn ghost" bindtap="goSettings"/);
  assert.doesNotMatch(wxml, /class="btn" bindtap="goFeedback"/);
  assert.doesNotMatch(wxml, /class="btn ghost" bindtap="goAbout"/);
});

test("ME01 load shows real nickname (display-only); ME05 follow summary + strip", async () => {
  api.request = (opts) => {
    if (opts.url === "/me") {
      return Promise.resolve({
        id: "u1",
        nickname: "星卡用户",
        avatarUrl: "https://wx.example/a.png",
        privacy: "private",
      });
    }
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
  assert.equal(page.data.avatarSrc, "https://wx.example/a.png");
  assert.equal(page.data.hasAvatar, true);
  assert.equal(page.data.followCount, 2);
  assert.equal(page.data.followLabel, "已关注 2 个团体");
  assert.equal(page.data.followPreview.length, 2);
  assert.equal(page.data.followPreview[0].initial, "H");
  assert.equal(page.data.editingNickname, undefined);
  assert.equal(page.data.draftNickname, undefined);
});

test("ME03 empty/收藏家 and unauthorized use 未设置昵称", async () => {
  api.request = (opts) => {
    if (opts.url === "/me") return Promise.resolve({ id: "u1", nickname: "收藏家", privacy: "private" });
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    return Promise.reject(new Error(opts.url));
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.displayName, "未设置昵称");
  assert.equal(page.data.nicknameUnset, true);
  assert.equal(page.data.hasAvatar, false);
  assert.equal(page.data.avatarSrc, "");
  assert.equal(page.data.followCount, 0);

  api.request = () => {
    const err = { status: 401, message: "未登录" };
    return Promise.reject(err);
  };
  const guest = pageWithData({});
  guest.load();
  await flush();
  assert.equal(guest.data.needsLogin, true);
  assert.equal(guest.data.displayName, "未设置昵称");
  assert.equal(guest.data.hasAvatar, false);
});

test("UX-A2 WeChat nickname fill PATCHes /me; existing name is display-only", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.method === "PATCH") {
      return Promise.resolve({ id: "u1", nickname: opts.data.nickname, privacy: "private" });
    }
    return Promise.resolve({ id: "u1", nickname: "收藏家", privacy: "private" });
  };
  const unset = pageWithData({
    user: { id: "u1", nickname: "收藏家" },
    nicknameUnset: true,
    follows: [{ id: "h2h", nameZh: "Hearts2Hearts", logoColor: "#f00" }],
    followPreview: [{ id: "h2h", nameZh: "Hearts2Hearts", logoColor: "#f00", initial: "H" }],
    followCount: 1,
  });
  unset.onWxNicknameFill({ detail: { value: "  微信昵称  " } });
  await flush();
  assert.ok(calls.some((c) => c.url === "/me" && c.method === "PATCH" && c.data.nickname === "微信昵称"));
  assert.equal(unset.data.displayName, "微信昵称");
  assert.equal(unset.data.nicknameUnset, false);
  assert.equal(unset.data.followCount, 1);

  calls.length = 0;
  const named = pageWithData({
    user: { id: "u1", nickname: "星卡用户" },
    nicknameUnset: false,
    displayName: "星卡用户",
  });
  named.onWxNicknameFill({ detail: { value: "新名字" } });
  await flush();
  assert.equal(
    calls.filter((c) => c.method === "PATCH").length,
    0,
  );
  assert.equal(named.data.displayName, "星卡用户");

  unset.onWxNicknameFill({ detail: { value: "   " } });
  await flush();
  assert.equal(typeof pageDef.saveNickname, "undefined");
  assert.equal(typeof pageDef.openNicknameEditor, "undefined");
});

test("UX-A3 chooseAvatar PATCHes /me avatarUrl; empty event is ignored", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.method === "PATCH") {
      return Promise.resolve({
        id: "u1",
        nickname: "星卡用户",
        avatarUrl: opts.data.avatarUrl,
        privacy: "private",
      });
    }
    return Promise.resolve({ id: "u1", nickname: "星卡用户", privacy: "private" });
  };
  const page = pageWithData({
    user: { id: "u1", nickname: "星卡用户" },
    nicknameUnset: false,
    displayName: "星卡用户",
    hasAvatar: false,
    avatarSrc: "",
  });
  page.onChooseAvatar({ detail: { avatarUrl: "  wxfile://tmp_avatar.jpg  " } });
  await flush();
  assert.ok(
    calls.some(
      (c) => c.url === "/me" && c.method === "PATCH" && c.data.avatarUrl === "wxfile://tmp_avatar.jpg",
    ),
  );
  assert.equal(page.data.avatarSrc, "wxfile://tmp_avatar.jpg");
  assert.equal(page.data.hasAvatar, true);
  assert.equal(page.data.displayName, "星卡用户");

  calls.length = 0;
  page.onChooseAvatar({ detail: { avatarUrl: "   " } });
  page.onChooseAvatar({ detail: {} });
  await flush();
  assert.equal(
    calls.filter((c) => c.method === "PATCH").length,
    0,
  );

  const guest = pageWithData({ needsLogin: true, hasAvatar: false });
  guest.onChooseAvatar({ detail: { avatarUrl: "https://wx.example/b.png" } });
  await flush();
  assert.equal(
    calls.filter((c) => c.method === "PATCH").length,
    0,
  );

  api.request = (opts) => {
    if (opts.url === "/me") {
      return Promise.resolve({
        id: "u1",
        nickname: "星卡用户",
        avatarUrl: "/media/custom/u1/a.jpg",
        privacy: "private",
      });
    }
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    return Promise.reject(new Error(opts.url));
  };
  const hosted = pageWithData({});
  hosted.load();
  await flush();
  assert.match(hosted.data.avatarSrc, /\/media\/custom\/u1\/a\.jpg$/);
  assert.equal(hosted.data.hasAvatar, true);
});

test("ME05 empty follows nudges to 管理关注; unified entries navigate", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /还没有关注组合/);
  assert.match(wxml, /去选择关注/);
  const page = pageWithData({});
  page.goFollowManage();
  page.goSettings();
  page.goFeedback();
  page.goAbout();
  assert.deepEqual(navigations, [
    { url: "/pages/follow-manage/index" },
    { url: "/pages/settings/index" },
    { url: "/pages/feedback/index" },
    { url: "/pages/about/index" },
  ]);
});

after(() => {
  api.request = origRequest;
});
