/**
 * Cardbook custom card tile delete (M1.5 hotfix)
 * run: node --test miniprogram/pages/cardbook/index.delete.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  showModal() {},
  request() {},
  navigateTo() {},
  switchTab() {},
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
  customCard.clearPreviewSrc();
});

test("wxml custom tiles expose 删除 without mixing into public catalog", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /catchtap="removeCustom"/);
  assert.match(wxml, />删除</);
  assert.match(wxml, /不计入上方官方进度/);
});

test("removeCustom confirm reloads list; cancel does not", async () => {
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
    customCards: [{ id: "c9", title: "私人卡", moderationStatus: "pending" }],
  });
  page.load = () => {
    loads += 1;
  };

  page.removeCustom({ currentTarget: { dataset: { id: "c9" } } });
  modals[0].success({ confirm: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 0);
  assert.equal(loads, 0);

  page.removeCustom({ currentTarget: { dataset: { id: "c9" } } });
  modals[modals.length - 1].success({ confirm: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls[0].url, "/collection/custom-cards/c9");
  assert.equal(calls[0].method, "DELETE");
  assert.equal(loads, 1);
  api.request = origReq;
  global.wx.showModal = origModal;
});
