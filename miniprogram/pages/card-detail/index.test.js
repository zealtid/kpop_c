/**
 * PR-P1-4 / O06 card detail: quantity / 品相 / 备注 PATCH
 * run: node --test miniprogram/pages/card-detail/index.test.js
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
    return Promise.resolve({ quantity: 2, condition: "mint", notes: "ok" });
  };
});

test("wxml has quantity stepper, 品相 chips, 备注, save", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, />数量</);
  assert.match(wxml, /bindtap="decQty"/);
  assert.match(wxml, /bindtap="incQty"/);
  assert.match(wxml, />品相</);
  assert.match(wxml, /bindtap="pickCondition"/);
  assert.match(wxml, />备注</);
  assert.match(wxml, /bindtap="save">保存</);
});

test("page is registered outside tabBar; pages[0] stays cardbook", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.ok(appJson.pages.includes("pages/card-detail/index"));
  const tabs = (appJson.tabBar.list || []).map((t) => t.pagePath);
  assert.ok(!tabs.includes("pages/card-detail/index"));
});

test("save PATCHes /collection/cards/:id with quantity condition notes", () => {
  const page = pageWithData({
    id: "tmpl-1",
    quantity: 3,
    condition: "good",
    notes: "微瑕角",
    missing: false,
    saving: false,
  });
  page.save();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/collection/cards/tmpl-1");
  assert.equal(requests[0].method, "PATCH");
  assert.deepEqual(requests[0].data, {
    quantity: 3,
    condition: "good",
    notes: "微瑕角",
  });
});

test("save 401 goes through handleWriteError", async () => {
  api.request = () => Promise.reject({ status: 401, message: "请先登录", code: "UNAUTHORIZED" });
  const page = pageWithData({
    id: "tmpl-1",
    quantity: 1,
    condition: "",
    notes: "",
    missing: false,
    saving: false,
  });
  page.save();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(toasts.some((t) => t.title === "请先登录"), true);
});

test("src uses handleWriteError and does not call camera APIs", () => {
  const src = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(src, /\.catch\(api\.handleWriteError\)|\.catch\(\(err\) => \{[\s\S]*api\.handleWriteError/);
  assert.doesNotMatch(src, /chooseMedia|chooseImage|CameraContext|camera/);
});

after(() => {
  api.request = origRequest;
});
