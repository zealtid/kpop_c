/**
 * C03 empty catalog search → 反馈缺卡 → /pages/feedback
 * run: node --test miniprogram/pages/catalog-search/index.feedback-cta.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
};

global.getApp = () => ({
  globalData: { token: "" },
});

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

test("empty state wxml has 反馈缺卡 CTA bound to goFeedback", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /wx:if="\{\{empty\}\}"/);
  assert.match(wxml, /没有匹配模板/);
  assert.match(wxml, /bindtap="goFeedback"/);
  assert.match(wxml, />反馈缺卡</);
});

test("goFeedback navigates to existing feedback page", () => {
  navigations.length = 0;
  pageDef.goFeedback();
  assert.deepEqual(navigations, [{ url: "/pages/feedback/index" }]);
});

test("app.json keeps pages[0]=cardbook and registers feedback", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.ok(appJson.pages.includes("pages/feedback/index"));
  assert.ok(appJson.pages.includes("pages/catalog-search/index"));
});
