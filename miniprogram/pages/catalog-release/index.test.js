/**
 * 刀 B 发行/专辑详情：版本切换 + confirmed 特典；待补禁假图。
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

test("wxml: empty copy, version chips, 待补无假图, footnote", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /暂无特典对照，请稍后再看/);
  assert.match(wxml, /bindtap="selectVersion"/);
  assert.match(wxml, /bindtap="openSlot"/);
  assert.match(wxml, /wx:if="\{\{slot\.imageUrl\}\}"/);
  assert.match(wxml, /图鉴待补/);
  assert.match(wxml, /\{\{footnote\}\}/);
  assert.doesNotMatch(wxml, /src="\/assets\/placeholder/);
  assert.doesNotMatch(wxml, /fake-card|dummy\.png|placeholder\.png/);
  assert.doesNotMatch(wxml, /已凑齐全部特典/);
});

test("published slot navigates to catalog search; pending toasts 图鉴待补", () => {
  const page = pageWithData({});
  page.openSlot({
    currentTarget: { dataset: { navigable: true, q: "预购特典 Weverse" } },
  });
  assert.equal(navigations.length, 1);
  assert.match(navigations[0].url, /\/pages\/catalog-search\/index\?q=/);
  assert.equal(toasts.length, 0);

  page.openSlot({ currentTarget: { dataset: { navigable: false, q: "无卡" } } });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "图鉴待补");
  assert.equal(navigations.length, 1);
});

test("load empty matrix shows empty state and incomplete footnote", async () => {
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({
      release: { id: "r1", title: "The Chase", releasedOn: "2025-02-24", kind: "single" },
      versions: ["Photobook A"],
      empty: true,
      rows: [],
      completeness: { ready: false, ratio: 0, copy: "特典信息来自运营对照表，可能不完整" },
    });
  };
  const page = pageWithData({ id: "r1" });
  page.load();
  for (let i = 0; i < 10 && !page.data.loaded; i++) {
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(requests[0].url, "/catalog/releases/r1/benefit-matrix");
  assert.equal(requests[0].auth, false);
  assert.equal(page.data.empty, true);
  assert.equal(page.data.emptyCopy, "暂无特典对照，请稍后再看");
  assert.equal(page.data.footnote, "特典信息来自运营对照表，可能不完整");
  assert.doesNotMatch(page.data.footnote, /已凑齐全部特典/);
  assert.equal(page.data.release.releasedOnLabel, "2025-02-24");
});

test("load published + draft rows: only published keeps image; version switch filters", async () => {
  api.request = () =>
    Promise.resolve({
      release: { id: "r2", title: "ARIRANG", releasedOn: "2026-03-20", kind: "album" },
      versions: ["Standard", "特典-JP"],
      empty: false,
      rows: [
        {
          id: "a",
          versionLabel: "standard",
          benefitNameZh: "已发布",
          channelNameZh: "Weverse Shop",
          slots: [
            {
              label: "预购特典 Weverse",
              templateStatus: "published",
              navigable: true,
              imageUrl: "/media/cards/real.png",
              templateName: "预购特典 Weverse",
            },
          ],
        },
        {
          id: "b",
          versionLabel: "standard",
          benefitNameZh: "待补",
          channelNameZh: "Yes24",
          slots: [{ label: "无卡", templateStatus: "missing", navigable: false, imageUrl: "/media/cards/fake.png" }],
        },
        {
          id: "c",
          versionLabel: "特典-JP",
          benefitNameZh: "日版",
          channelNameZh: "未知",
          slots: [],
        },
      ],
      completeness: { ready: false, ratio: 0.5, copy: "特典信息来自运营对照表，可能不完整" },
    });
  const page = pageWithData({ id: "r2" });
  page.load();
  for (let i = 0; i < 10 && !page.data.loaded; i++) {
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(page.data.empty, false);
  assert.equal(page.data.visibleRows.length, 2);
  assert.equal(page.data.visibleRows[0].slots[0].imageUrl.endsWith("/media/cards/real.png"), true);
  assert.equal(page.data.visibleRows[1].slots[0].imageUrl, "");
  assert.equal(page.data.visibleRows[1].slots[0].pending, true);
  page.selectVersion({ currentTarget: { dataset: { version: "特典-JP" } } });
  assert.equal(page.data.selectedVersion, "特典-JP");
  assert.equal(page.data.visibleRows.length, 1);
  assert.equal(page.data.visibleRows[0].benefitNameZh, "日版");
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
