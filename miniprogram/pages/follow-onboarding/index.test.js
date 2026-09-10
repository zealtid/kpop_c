/**
 * 首次关注引导仍走 1–3，并与管理关注共用 follow-picker
 * run: node --test miniprogram/pages/follow-onboarding/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const tabs = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  setStorageSync() {},
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  switchTab(opts) {
    tabs.push(opts);
  },
};

global.getApp = () => ({ globalData: { token: "t" } });

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
  tabs.length = 0;
  api.request = origRequest;
});

test("onboarding json/wxml share follow-picker with 1–3 complete copy", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "index.json"), "utf8"));
  assert.equal(json.usingComponents["follow-picker"], "/components/follow-picker/index");
  assert.match(wxml, /complete-text="进入卡册"/);
  assert.match(wxml, /max-count="\{\{maxCount\}\}"/);
  assert.match(wxml, /show-skip="\{\{true\}\}"/);
});

test("onboarding still blocks a 4th group and skip does not PUT", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.url === "/catalog/groups") {
      return Promise.resolve({
        groups: [
          { id: "a", nameZh: "A" },
          { id: "b", nameZh: "B" },
          { id: "c", nameZh: "C" },
          { id: "d", nameZh: "D" },
        ],
      });
    }
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    return Promise.resolve({});
  };
  const page = pageWithData({ maxCount: 3, minCount: 1, groups: [] });
  page.load();
  await flush();
  page.onToggle({ detail: { id: "a" } });
  page.onToggle({ detail: { id: "b" } });
  page.onToggle({ detail: { id: "c" } });
  page.onToggle({ detail: { id: "d" } });
  assert.equal(page.data.groups.filter((g) => g.selected).length, 3);
  assert.ok(toasts.some((t) => t.title.indexOf("最多选择 3") !== -1));

  page.skip();
  assert.equal(calls.filter((c) => c.method === "PUT").length, 0);
  assert.deepEqual(tabs, [{ url: "/pages/cardbook/index" }]);
});

after(() => {
  api.request = origRequest;
});
