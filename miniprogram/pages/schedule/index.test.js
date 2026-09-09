/**
 * M2-b schedule list + detail smoke
 * run: node --test miniprogram/pages/schedule/index.test.js miniprogram/pages/schedule-detail/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const navigations = [];
const tabs = [];
const requests = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
  switchTab(opts) {
    tabs.push(opts);
  },
};

let token = "";
global.getApp = () => ({ globalData: { token } });

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
  requests.length = 0;
  token = "jwt";
  api.request = (opts) => {
    requests.push(opts);
    if (opts.url === "/me/follows") {
      return Promise.resolve({ groups: [{ id: "g1", nameZh: "BTS" }] });
    }
    if (String(opts.url).startsWith("/schedule/today")) {
      return Promise.resolve({
        dateShanghai: "2026-09-09",
        timezone: "Asia/Shanghai",
        events: [
          {
            id: "s1",
            title: "BTS 门票开售",
            kind: "ticket_sale",
            status: "published",
            trustLevel: "L1",
            startAtShanghai: "2026-09-09T18:00:00+08:00",
            groupId: "g1",
            group: { id: "g1", nameZh: "BTS" },
          },
        ],
      });
    }
    if (String(opts.url).startsWith("/schedule")) {
      return Promise.resolve({
        timezone: "Asia/Shanghai",
        events: [
          {
            id: "s1",
            title: "BTS 门票开售",
            kind: "ticket_sale",
            status: "published",
            trustLevel: "L1",
            startAtShanghai: "2026-09-09T18:00:00+08:00",
            groupId: "g1",
            group: { id: "g1", nameZh: "BTS" },
          },
        ],
      });
    }
    return Promise.resolve({});
  };
});

test("wxml has today strip, list, ticket countdown, Shanghai copy", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(wxml, /今日/);
  assert.match(wxml, /today-strip/);
  assert.match(wxml, /列表/);
  assert.match(wxml, /countdown/);
  assert.match(wxml, /Asia\/Shanghai|北京时间/);
  assert.match(wxml, /去我的加关注/);
  assert.doesNotMatch(wxml, /缺卡|web-view|订阅消息|爬虫/);
  assert.doesNotMatch(js, /requestSubscribeMessage|web-view|crawler/);
});

test("S01 load today+list via API and maps startAtShanghai", async () => {
  const page = pageWithData({});
  page.load();
  await flush();
  await flush();
  page.stopCountdown();
  assert.ok(requests.some((r) => String(r.url).startsWith("/schedule/today")));
  assert.ok(requests.some((r) => r.url === "/schedule" || r.url.startsWith("/schedule?")));
  assert.equal(page.data.timezone, "Asia/Shanghai");
  assert.equal(page.data.visibleToday[0].isTicketSale, true);
  assert.equal(page.data.visibleToday[0].startLabel, "09-09 18:00");
  assert.ok(page.data.sections.length >= 1);
});

test("openSchedule goes to detail; empty follows CTA to 我的", () => {
  const page = pageWithData({});
  page.openSchedule({ currentTarget: { dataset: { id: "s1" } } });
  assert.deepEqual(navigations, [{ url: "/pages/schedule-detail/index?id=s1" }]);
  page.goMine();
  assert.deepEqual(tabs, [{ url: "/pages/mine/index" }]);
});

after(() => {
  api.request = origRequest;
});
