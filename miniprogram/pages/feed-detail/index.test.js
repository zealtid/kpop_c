/**
 * M2-b feed detail: summary/body/source/trust + copy/open, no web-view
 * run: node --test miniprogram/pages/feed-detail/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const toasts = [];
const clips = [];
const opens = [];
const requests = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  setClipboardData(opts) {
    clips.push(opts.data);
    if (opts.success) opts.success();
  },
  openUrl(opts) {
    opens.push(opts.url);
  },
};

global.getApp = () => ({ globalData: { token: "" } });

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
  toasts.length = 0;
  clips.length = 0;
  opens.length = 0;
  requests.length = 0;
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({
      id: "f1",
      title: "官方预告",
      summary: "摘要正文",
      body: "完整正文",
      trustLevel: "L1",
      status: "published",
      isMachineTranslated: true,
      sourceNote: "Weverse 官方",
      canonicalUrl: "https://weverse.io/h2h",
      groups: [{ nameZh: "H2H" }],
    });
  };
});

test("wxml shows summary/body/source/trust and copy/open without web-view", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(wxml, /item\.summary/);
  assert.match(wxml, /item\.body/);
  assert.match(wxml, /来源/);
  assert.match(wxml, /trustLabel/);
  assert.match(wxml, /复制链接/);
  assert.match(wxml, /系统打开/);
  assert.doesNotMatch(wxml, /web-view|缺卡|订阅/);
  assert.doesNotMatch(js, /web-view|requestSubscribeMessage|crawler/);
});

test("load GET /feed/:id and decorate machine-translate", async () => {
  const page = pageWithData({ id: "f1" });
  page.load();
  await flush();
  await flush();
  assert.equal(requests[0].url, "/feed/f1");
  assert.equal(page.data.item.title, "官方预告");
  assert.equal(page.data.item.translatedMark, "机翻");
  assert.equal(page.data.item.sourceBadge, "Weverse 官方");
  assert.equal(page.data.missing, false);
});

test("copyLink and openLink", () => {
  const page = pageWithData({
    item: { outboundUrl: "https://weverse.io/h2h" },
  });
  page.copyLink();
  page.openLink();
  assert.deepEqual(clips, ["https://weverse.io/h2h"]);
  assert.deepEqual(opens, ["https://weverse.io/h2h"]);
});

test("L3 payload is treated as missing", async () => {
  api.request = () =>
    Promise.resolve({ id: "x", trustLevel: "L3", status: "published", title: "nope" });
  const page = pageWithData({ id: "x" });
  page.load();
  await flush();
  await flush();
  assert.equal(page.data.missing, true);
});

after(() => {
  api.request = origRequest;
});
