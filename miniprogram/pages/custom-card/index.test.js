/**
 * M1.5.1 UX06 custom-card detail fullscreen
 * run: node --test miniprogram/pages/custom-card/index.test.js
 */
const { test, beforeEach } = require("node:test");
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
  navigateBack() {},
};

global.getApp = () => ({ globalData: { token: "" } });

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const customCard = require("../../utils/customCard");

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
  navigations.length = 0;
  customCard.clearPreviewSrc();
});

test("wxml has 查看大图 only when canPreview; rejected copy is not 收藏大图", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /wx:if="\{\{canPreview\}\}"/);
  assert.match(wxml, /bindtap="openPreview">查看大图/);
  assert.match(wxml, /card\.moderationStatus==='rejected'/);
  assert.doesNotMatch(wxml, /收藏大图/);
});

test("pending owner can open fullscreen and close path is registered", () => {
  const page = pageWithData({
    canPreview: true,
    card: { mainImageUrl: "https://x/img.jpg", moderationStatus: "pending" },
  });
  page.openPreview();
  assert.equal(navigations[0].url, "/pages/image-preview/index");
  assert.equal(customCard.takePreviewSrc(), "https://x/img.jpg");
});

test("rejected has no fullscreen entry", () => {
  const page = pageWithData({
    canPreview: false,
    card: { mainImageUrl: "https://x/img.jpg", moderationStatus: "rejected" },
  });
  page.openPreview();
  assert.equal(navigations.length, 0);
});
