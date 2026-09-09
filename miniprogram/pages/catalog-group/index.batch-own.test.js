/**
 * PR-P1-1 / O02 + C01: catalog-group multi-select, batch own, 特典 badge.
 * run: node --test miniprogram/pages/catalog-group/index.batch-own.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const requests = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  navigateTo() {},
};

global.getApp = () => ({
  globalData: { token: "" },
  login() {},
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

beforeEach(() => {
  toasts.length = 0;
  requests.length = 0;
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({});
  };
});

test("wxml shows 特典 badge, multi-select toggle, and 批量拥有", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /wx:if="\{\{t\.isBenefit\}\}"/);
  assert.match(wxml, /class="benefit-badge">特典</);
  assert.match(wxml, /bindtap="toggle"/);
  assert.match(wxml, /已选 \{\{selected\.length\}\}/);
  assert.match(wxml, /bindtap="batchOwn">批量拥有</);
  assert.match(wxml, /catchtap="ownOne"/);
  assert.match(wxml, /catchtap="wantOne"/);
});

test("wxss has Scheme A benefit corner badge and selected outline", () => {
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxss, /\.benefit-badge/);
  assert.match(wxss, /position:\s*absolute/);
  assert.match(wxss, /--color-warning/);
  assert.match(wxss, /--color-brand/);
  assert.match(wxss, /\.sel/);
  assert.doesNotMatch(wxss, /#121016|#ff6b9d|#f5c36b/i);
  assert.doesNotMatch(wxss, /rgba\(\s*18\s*,\s*16\s*,\s*22/);
});

test("toggle updates selected across album sections", () => {
  const page = pageWithData({
    releases: [
      { id: "r1", templates: [{ id: "t1", on: false, isBenefit: true }] },
      { id: "r2", templates: [{ id: "t2", on: false, isBenefit: false }] },
    ],
    selected: [],
  });
  page.toggle({ currentTarget: { dataset: { id: "t1" } } });
  assert.deepEqual(page.data.selected, ["t1"]);
  assert.equal(page.data.releases[0].templates[0].on, true);
  page.toggle({ currentTarget: { dataset: { id: "t2" } } });
  assert.deepEqual(page.data.selected, ["t1", "t2"]);
});

test("batchOwn posts /collection/cards/batch and uses handleWriteError", () => {
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(src, /\/collection\/cards\/batch/);
  assert.match(src, /\.catch\(api\.handleWriteError\)/);

  const page = pageWithData({ selected: ["a", "b"] });
  page.batchOwn();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/collection/cards/batch");
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].data, {
    items: [
      { templateId: "a", quantity: 1 },
      { templateId: "b", quantity: 1 },
    ],
  });
});

test("batchOwn with no selection toasts 先点选卡片", () => {
  const page = pageWithData({ selected: [] });
  page.batchOwn();
  assert.equal(requests.length, 0);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "先点选卡片");
});

test("batchOwn 401 goes through handleWriteError", async () => {
  api.request = () => Promise.reject({ status: 401, message: "请先登录", code: "UNAUTHORIZED" });
  const page = pageWithData({ selected: ["a"] });
  page.batchOwn();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(toasts.some((t) => t.title === "请先登录"), true);
});

test("app.json keeps pages[0]=cardbook and 星卡 branding", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.ok(appJson.pages.includes("pages/catalog-group/index"));
  assert.equal(appJson.window.navigationBarTitleText, "星卡");
});

after(() => {
  api.request = origRequest;
});
