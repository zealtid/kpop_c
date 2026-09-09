/**
 * PR-P1-4 / O06: owned card tile opens detail (not tabBar)
 * run: node --test miniprogram/pages/cardbook-group/index.card-detail.test.js
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
  showModal() {},
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
};

global.getApp = () => ({ globalData: { token: "" } });

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

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
});

test("wxml opens card detail from owned tiles and still catchtap unown", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /bindtap="openCard"/);
  assert.match(wxml, /catchtap="unown"/);
  assert.match(wxml, /item\.conditionLabel/);
});

test("openCard navigates to card-detail for owned/duplicates, not 想要", () => {
  const owned = pageWithData({ tab: 0 });
  owned.openCard({ currentTarget: { dataset: { id: "abc" } } });
  assert.equal(navigations[0].url, "/pages/card-detail/index?id=abc");

  const wanted = pageWithData({ tab: 1 });
  wanted.openCard({ currentTarget: { dataset: { id: "abc" } } });
  assert.equal(navigations.length, 1);

  const dup = pageWithData({ tab: 2 });
  dup.openCard({ currentTarget: { dataset: { id: "dup-1" } } });
  assert.equal(navigations[1].url, "/pages/card-detail/index?id=dup-1");
});

test("wxml custom tiles have catchtap 删除 without opening official Template CRUD", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /catchtap="removeCustom"/);
  assert.match(wxml, /catchtap="removeCustom" data-id="\{\{item.id\}\}">删除/);
  assert.doesNotMatch(wxml, /\/admin\/templates/);
});

test("removeCustom confirm refreshes list; cancel does not", async () => {
  const api = require("../../utils/api");
  const origReq = api.request;
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    return Promise.resolve({ deleted: true });
  };
  const modals = [];
  const origModal = global.wx.showModal;
  global.wx.showModal = (opts) => {
    modals.push(opts);
  };

  let loads = 0;
  const page = pageWithData({
    custom: [{ id: "c1", mainImageUrl: "/media/custom/x.jpg", moderationStatus: "pending" }],
  });
  page.load = () => {
    loads += 1;
  };

  page.removeCustom({ currentTarget: { dataset: { id: "c1" } } });
  modals[0].success({ confirm: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 0);
  assert.equal(loads, 0);

  page.removeCustom({ currentTarget: { dataset: { id: "c1" } } });
  modals[modals.length - 1].success({ confirm: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls[0].url, "/collection/custom-cards/c1");
  assert.equal(calls[0].method, "DELETE");
  assert.equal(loads, 1);
  api.request = origReq;
  global.wx.showModal = origModal;
});

test("custom tile image opens fullscreen preview for pending", () => {
  const customCard = require("../../utils/customCard");
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /catchtap="openPreview"/);
  const page = pageWithData({
    custom: [{ id: "c1", mainImageUrl: "/media/custom/x.jpg", moderationStatus: "pending" }],
  });
  page.openPreview({ currentTarget: { dataset: { id: "c1" } } });
  assert.equal(navigations[navigations.length - 1].url, "/pages/image-preview/index");
  assert.equal(customCard.takePreviewSrc(), "/media/custom/x.jpg");
});
