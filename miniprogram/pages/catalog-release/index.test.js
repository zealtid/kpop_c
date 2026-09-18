/**
 * 发行页：对照矩阵已软下线，只展示发行信息与已发布小卡。
 * run: node --test miniprogram/pages/catalog-release/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const navigations = [];
const requests = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
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
  navigations.length = 0;
  requests.length = 0;
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({});
  };
});

test("wxml has no benefit-matrix / 特典对照 / 通路", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "index.json"), "utf8"));
  assert.doesNotMatch(wxml, /特典对照/);
  assert.doesNotMatch(wxml, /benefit-matrix/);
  assert.doesNotMatch(wxml, /通路/);
  assert.doesNotMatch(wxml, /selectVersion/);
  assert.doesNotMatch(wxml, /openSlot/);
  assert.match(wxml, /暂无已发布小卡/);
  assert.match(wxml, /bindtap="openCard"/);
  assert.equal(json.navigationBarTitleText, "专辑");
});

test("published template tile opens catalog detail", () => {
  const page = pageWithData({});
  page.openCard({ currentTarget: { dataset: { id: "tmpl-1" } } });
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].url, "/pages/card-detail/index?id=tmpl-1&from=catalog");
});

test("load uses release + templates APIs, not benefit-matrix", async () => {
  api.request = (opts) => {
    requests.push(opts);
    if (String(opts.url).endsWith("/templates")) {
      return Promise.resolve({
        templates: [
          {
            id: "t1",
            name: "Carmen",
            memberNameEn: "Carmen",
            version: "Standard",
            isBenefit: false,
            mainImageUrl: "/media/cards/real.png",
          },
        ],
      });
    }
    return Promise.resolve({
      release: { id: "r1", title: "The Chase", releasedOn: "2025-02-24", kind: "single" },
    });
  };
  const page = pageWithData({ id: "r1" });
  page.load();
  for (let i = 0; i < 10 && !page.data.loaded; i++) {
    await new Promise((r) => setImmediate(r));
  }
  assert.ok(requests.some((r) => r.url === "/catalog/releases/r1"));
  assert.ok(requests.some((r) => r.url === "/catalog/releases/r1/templates"));
  assert.ok(!requests.some((r) => String(r.url).includes("benefit-matrix")));
  assert.equal(page.data.empty, false);
  assert.equal(page.data.templates.length, 1);
  assert.equal(page.data.release.releasedOnLabel, "2025-02-24");
});

test("empty templates show empty state without matrix copy", async () => {
  api.request = (opts) => {
    requests.push(opts);
    if (String(opts.url).endsWith("/templates")) return Promise.resolve({ templates: [] });
    return Promise.resolve({
      release: { id: "r2", title: "ARIRANG", releasedOn: "2026-03-20", kind: "album" },
    });
  };
  const page = pageWithData({ id: "r2" });
  page.load();
  for (let i = 0; i < 10 && !page.data.loaded; i++) {
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(page.data.empty, true);
  assert.equal(page.data.templates.length, 0);
});

test("app.json registers catalog-release and keeps cardbook first", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.ok(appJson.pages.includes("pages/catalog-release/index"));
  assert.ok(!appJson.tabBar.list.some((t) => /特典/.test(t.text)));
});

after(() => {
  api.request = origRequest;
});
