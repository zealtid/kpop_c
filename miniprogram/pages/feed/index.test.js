/**
 * M2-b 情报 home: chips + today strip + feed cards
 * run: node --test miniprogram/pages/feed/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];
const tabs = [];
const toasts = [];
const clips = [];
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
  switchTab(opts) {
    tabs.push(opts);
  },
  setClipboardData(opts) {
    clips.push(opts.data);
    if (opts.success) opts.success();
  },
};

let token = "";
global.getApp = () => ({
  globalData: { token },
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
    _timer: null,
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
  navigations.length = 0;
  tabs.length = 0;
  toasts.length = 0;
  clips.length = 0;
  requests.length = 0;
  token = "";
  api.request = (opts) => {
    requests.push(opts);
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    if (opts.url === "/feed" || opts.url === "/feed/featured") {
      return Promise.resolve({
        timeline: opts.url === "/feed/featured" ? "featured" : "featured",
        items: [
          {
            id: "f1",
            title: "H2H 预告",
            summary: "摘要",
            trustLevel: "L1",
            status: "published",
            isMachineTranslated: false,
            sourceNote: "Weverse 官方",
            canonicalUrl: "https://weverse.io/h2h",
            groupIds: ["g1"],
            groups: [{ id: "g1", nameZh: "H2H" }],
          },
          {
            id: "l3",
            title: "rumor",
            trustLevel: "L3",
            status: "published",
            sourceNote: "x",
            groupIds: ["g1"],
          },
        ],
      });
    }
    if (String(opts.url).startsWith("/schedule/today")) {
      return Promise.resolve({
        dateShanghai: "2026-09-09",
        timezone: "Asia/Shanghai",
        events: [
          {
            id: "s1",
            title: "门票开售",
            kind: "ticket_sale",
            status: "published",
            trustLevel: "L1",
            startAtShanghai: "2026-09-09T18:00:00+08:00",
            group: { id: "g1", nameZh: "BTS" },
            groupId: "g1",
          },
        ],
      });
    }
    return Promise.resolve({});
  };
});

test("wxml has chips, today strip, feed cards, empty/featured CTAs", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /selectGroup/);
  assert.match(wxml, /chips/);
  assert.match(wxml, /今日日程/);
  assert.match(wxml, /全部日程/);
  assert.match(wxml, /today-strip/);
  assert.match(wxml, /item\.trustLabel/);
  assert.match(wxml, /item\.translatedMark/);
  assert.match(wxml, /item\.sourceBadge/);
  assert.match(wxml, /复制链接/);
  assert.match(wxml, /去我的加关注/);
  assert.match(wxml, /去看看精选/);
  assert.match(wxml, /countdown/);
});

test("T01 pages[0] stays 卡册; 情报 remains tab; detail pages registered", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.ok(appJson.pages.includes("pages/feed/index"));
  assert.ok(appJson.pages.includes("pages/feed-detail/index"));
  assert.ok(appJson.pages.includes("pages/schedule/index"));
  assert.ok(appJson.pages.includes("pages/schedule-detail/index"));
  const tabsList = (appJson.tabBar.list || []).map((t) => t.text);
  assert.deepEqual(tabsList, ["情报", "卡册", "图鉴", "我的"]);
  assert.equal(appJson.tabBar.list[0].pagePath, "pages/feed/index");
});

test("X01 no 缺卡 entry, crawler, subscribe template, or web-view", () => {
  const files = ["index.js", "index.wxml", "index.json"].map((f) =>
    fs.readFileSync(path.join(__dirname, f), "utf8"),
  );
  const blob = files.join("\n");
  assert.doesNotMatch(blob, /缺卡/);
  assert.doesNotMatch(blob, /crawler|爬虫/);
  assert.doesNotMatch(blob, /requestSubscribeMessage|subscribeMessage|tmplId|订阅消息/);
  assert.doesNotMatch(blob, /web-view|webview/i);
});

test("guest uses L1 featured /feed with auth:false and drops L3", async () => {
  token = "";
  const page = pageWithData({});
  page.load();
  await flush();
  await flush();
  page.stopCountdown();
  assert.ok(requests.some((r) => r.url === "/feed" && r.auth === false));
  assert.ok(requests.some((r) => String(r.url).startsWith("/schedule/today") && r.auth === false));
  assert.equal(page.data.mode, "guest");
  assert.equal(page.data.showingFeatured, true);
  assert.ok(page.data.items.every((x) => x.trustLevel !== "L3"));
  assert.equal(page.data.items.some((x) => x.id === "f1"), true);
  assert.equal(page.data.visibleToday.some((x) => x.isTicketSale), true);
});

test("T02 unfollowed shows empty then 去看看精选 hits /feed/featured", async () => {
  token = "jwt";
  api.request = (opts) => {
    requests.push(opts);
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    if (opts.url === "/feed") return Promise.resolve({ timeline: "followed", items: [] });
    if (opts.url === "/feed/featured") {
      return Promise.resolve({
        timeline: "featured",
        items: [
          {
            id: "feat",
            title: "精选",
            trustLevel: "L1",
            status: "published",
            sourceNote: "ops",
            canonicalUrl: "https://example.com/f",
          },
        ],
      });
    }
    if (String(opts.url).startsWith("/schedule/today")) {
      return Promise.resolve({ events: [], timezone: "Asia/Shanghai" });
    }
    return Promise.resolve({});
  };
  const page = pageWithData({});
  page.load();
  await flush();
  await flush();
  page.stopCountdown();
  assert.equal(page.data.emptyFollows, true);
  assert.equal(page.data.mode, "empty-follows");
  page.loadFeatured();
  await flush();
  await flush();
  assert.ok(requests.some((r) => r.url === "/feed/featured" && r.auth === false));
  assert.equal(page.data.showingFeatured, true);
  assert.equal(page.data.items[0].id, "feat");
});

test("followed timeline requests /me/follows /feed /schedule/today", async () => {
  token = "jwt";
  api.request = (opts) => {
    requests.push(opts);
    if (opts.url === "/me/follows") {
      return Promise.resolve({ groups: [{ id: "g1", nameZh: "H2H" }] });
    }
    if (opts.url === "/feed") {
      return Promise.resolve({
        timeline: "followed",
        items: [
          {
            id: "f1",
            title: "L1",
            trustLevel: "L1",
            status: "published",
            sourceNote: "官方",
            canonicalUrl: "https://weverse.io/x",
            groupIds: ["g1"],
            groups: [{ id: "g1", nameZh: "H2H" }],
          },
        ],
      });
    }
    if (String(opts.url).startsWith("/schedule/today")) {
      return Promise.resolve({ events: [], timezone: "Asia/Shanghai" });
    }
    return Promise.resolve({});
  };
  const page = pageWithData({});
  page.load();
  await flush();
  await flush();
  page.stopCountdown();
  assert.ok(requests.some((r) => r.url === "/me/follows"));
  assert.ok(requests.some((r) => r.url === "/feed" && r.auth !== false));
  assert.equal(page.data.mode, "followed");
  assert.equal(page.data.chips[0].name, "全部");
  assert.equal(page.data.items[0].sourceBadge, "官方");
});

test("goMine switches to 我的; openFeed goes to detail; copyLink uses clipboard", () => {
  const page = pageWithData({});
  page.goMine();
  assert.deepEqual(tabs, [{ url: "/pages/mine/index" }]);
  page.openFeed({ currentTarget: { dataset: { id: "abc" } } });
  assert.deepEqual(navigations, [{ url: "/pages/feed-detail/index?id=abc" }]);
  page.copyLink({ currentTarget: { dataset: { url: "https://ibighit.com/bts" } } });
  assert.deepEqual(clips, ["https://ibighit.com/bts"]);
});

after(() => {
  api.request = origRequest;
});
