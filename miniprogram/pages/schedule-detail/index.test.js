/**
 * M2-b schedule detail
 * run: node --test miniprogram/pages/schedule-detail/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const clips = [];
const opens = [];
const requests = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast() {},
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
  clips.length = 0;
  opens.length = 0;
  requests.length = 0;
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({
      id: "s1",
      title: "门票开售",
      kind: "ticket_sale",
      status: "published",
      trustLevel: "L1",
      startAtShanghai: "2026-09-09T18:00:00+08:00",
      timezone: "Asia/Shanghai",
      sourceUrl: "https://weverse.io/bts",
      group: { nameZh: "BTS" },
    });
  };
});

test("wxml has countdown, Shanghai time, copy/open, no 缺卡/web-view", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(wxml, /开售倒计时/);
  assert.match(wxml, /北京时间/);
  assert.match(wxml, /复制链接/);
  assert.match(wxml, /系统打开/);
  assert.doesNotMatch(wxml, /缺卡|web-view|releaseId/);
  assert.doesNotMatch(js, /web-view|requestSubscribeMessage|crawler/);
});

test("load GET /schedule/:id", async () => {
  const page = pageWithData({ id: "s1" });
  page.load();
  await flush();
  await flush();
  page.stopCountdown();
  assert.equal(requests[0].url, "/schedule/s1");
  assert.equal(page.data.event.isTicketSale, true);
  assert.equal(page.data.event.outboundUrl, "https://weverse.io/bts");
});

test("copy and open outbound", () => {
  const page = pageWithData({ event: { outboundUrl: "https://weverse.io/bts" } });
  page.copyLink();
  page.openLink();
  assert.deepEqual(clips, ["https://weverse.io/bts"]);
  assert.deepEqual(opens, ["https://weverse.io/bts"]);
});

after(() => {
  api.request = origRequest;
});
