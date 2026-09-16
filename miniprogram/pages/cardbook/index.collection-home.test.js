/**
 * 收藏 Tab 布局 enrich（双入口 + 封面小卡 + 文案）
 * run: node --test miniprogram/pages/cardbook/index.collection-home.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scrolls = [];
const navigations = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  showModal() {},
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
  switchTab(opts) {
    navigations.push(opts);
  },
  pageScrollTo(opts) {
    scrolls.push(opts);
  },
};

global.getApp = () => ({
  globalData: { token: "t", loginState: "ok" },
  login() {
    return Promise.resolve(true);
  },
});

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const api = require("../../utils/api");
const origReq = api.request;

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
  scrolls.length = 0;
  navigations.length = 0;
  api.request = origReq;
});

test("wxml/json 收藏命名 + 双入口 + 封面位不用团标", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "index.json"), "utf8"));
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(json.navigationBarTitleText, "收藏");
  assert.equal(appJson.tabBar.list[0].text, "收藏");
  assert.equal(appJson.tabBar.list.length, 3);
  assert.match(wxml, />收藏</);
  assert.doesNotMatch(wxml, /我的卡册/);
  assert.match(wxml, /dual-entry/);
  assert.match(wxml, /bindtap="focusGroups"/);
  assert.match(wxml, /拍照入册/);
  assert.doesNotMatch(wxml, /拍照加入卡册/);
  assert.match(wxml, /登录后查看收藏/);
  assert.match(wxml, /先关注组合/);
  assert.match(wxml, /历史私人卡/);
  assert.match(wxml, /item\.coverSrc/);
  assert.match(wxml, /wx:if="\{\{item\.hasCover\}\}"/);
  assert.doesNotMatch(wxml, /cover-img[^>]+item\.logoSrc/);
  assert.doesNotMatch(wxml, /通知|私信|Bias|心愿/);
  assert.match(wxml, /id="group-list"/);
});

test("wxss uses star卡 tokens and larger rounded cards", () => {
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxss, /--color-brand/);
  assert.match(wxss, /--color-brand-soft/);
  assert.match(wxss, /--color-progress-fill/);
  assert.match(wxss, /border-radius:\s*32rpx/);
  assert.doesNotMatch(wxss, /#121016|#ff6b9d/i);
});

test("focusGroups scrolls to list; 拍照入册 opens catalog-grid", () => {
  const page = pageWithData({ needsLogin: false });
  page.focusGroups();
  assert.equal(scrolls[0].selector, "#group-list");
  page.addFromCatalog();
  assert.equal(navigations[0].url, "/pages/catalog-grid/index");
});

test("list visual uses cover image and never falls back to group icon", async () => {
  api.request = (opts) => {
    if (opts.url === "/collection/overview") {
      return Promise.resolve({
        groups: [
          {
            id: "g1",
            slug: "bts",
            nameZh: "防弹少年团",
            iconUrl: "/media/groups/bts.png",
            logoUrl: "/media/groups/bts.png",
            logoColor: "#6B5CFF",
            progress: { ownedDistinct: 3, publishedCount: 21 },
            cover: { templateId: "t1", mainImageUrl: "/media/cards/yeon.jpg", source: "user" },
          },
          {
            id: "g2",
            slug: "h2h",
            nameZh: "Hearts2Hearts",
            iconUrl: "/media/groups/h2h.png",
            logoColor: "#ff8fb8",
            progress: { ownedDistinct: 0, publishedCount: 12 },
            cover: { templateId: null, mainImageUrl: null, source: "none" },
          },
        ],
        customCards: [],
        customCount: 0,
      });
    }
    if (opts.url === "/me/follows") {
      return Promise.resolve({
        groups: [
          { id: "g1", slug: "bts" },
          { id: "g2", slug: "h2h" },
        ],
      });
    }
    return Promise.resolve({});
  };
  const page = pageWithData({});
  page.load();
  await new Promise((r) => setImmediate(r));
  assert.equal(page.data.followCount, 2);
  assert.equal(page.data.groups[0].hasCover, true);
  assert.ok(String(page.data.groups[0].coverSrc).includes("/media/cards/yeon.jpg"));
  assert.ok(!String(page.data.groups[0].coverSrc).includes("/media/groups/"));
  assert.equal(page.data.groups[1].hasCover, false);
  assert.equal(page.data.groups[1].coverSrc, "");
  assert.ok(String(page.data.groups[1].logoSrc).includes("/media/groups/h2h.png"));
});
