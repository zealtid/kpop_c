/**
 * M1.5.1 UX06 custom-card detail fullscreen
 * run: node --test miniprogram/pages/custom-card/index.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];
const backCalls = [];
const modals = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  showModal(opts) {
    modals.push(opts);
  },
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
  navigateBack() {
    backCalls.push(true);
  },
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
  backCalls.length = 0;
  modals.length = 0;
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

test("wxml has Delete button bound to remove", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /bindtap="remove">删除/);
});

test("remove confirm deletes then navigateBack; cancel stays", async () => {
  const api = require("../../utils/api");
  const calls = [];
  const origReq = api.request;
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({ deleted: true });
  };
  const page = pageWithData({ id: "c-del", missing: false });

  page.remove();
  assert.equal(modals.length, 1);
  modals[0].success({ confirm: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 0);
  assert.equal(backCalls.length, 0);

  page.remove();
  modals[modals.length - 1].success({ confirm: true });
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(calls[0].url, "/collection/custom-cards/c-del");
  assert.equal(calls[0].method, "DELETE");
  assert.equal(backCalls.length, 1);
  api.request = origReq;
});

test("rejected has no fullscreen entry", () => {
  const page = pageWithData({
    canPreview: false,
    card: { mainImageUrl: "https://x/img.jpg", moderationStatus: "rejected" },
  });
  page.openPreview();
  assert.equal(navigations.length, 0);
});
