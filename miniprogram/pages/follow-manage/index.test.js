/**
 * UX-A 关注管理 ME07
 * run: node --test miniprogram/pages/follow-manage/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backs = [];
const toasts = [];

global.wx = {
  getStorageSync() {
    return "";
  },
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  navigateBack() {
    backs.push(true);
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

const catalog = {
  groups: [
    { id: "h2h", nameZh: "Hearts2Hearts", nameEn: "H2H", aliases: "H2H", logoColor: "#f00" },
    { id: "bts", nameZh: "防弹少年团", nameEn: "BTS", aliases: "防弹", logoColor: "#00f" },
    { id: "aespa", nameZh: "aespa", nameEn: "aespa", aliases: "", logoColor: "#0f0" },
  ],
};

beforeEach(() => {
  backs.length = 0;
  toasts.length = 0;
  api.request = origRequest;
});

test("ME07 page uses shared follow-picker with search / clear / sticky 完成", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "index.json"), "utf8"));
  const picker = fs.readFileSync(path.join(__dirname, "../../components/follow-picker/index.wxml"), "utf8");
  const pickerWxss = fs.readFileSync(path.join(__dirname, "../../components/follow-picker/index.wxss"), "utf8");
  assert.equal(json.usingComponents["follow-picker"], "/components/follow-picker/index");
  assert.match(wxml, /complete-text="完成"/);
  assert.match(picker, /搜索团体名称或别名/);
  assert.match(picker, /清空已选/);
  assert.match(picker, /sticky-bar/);
  assert.match(pickerWxss, /position:\s*fixed/);
});

test("ME07 load, clear, unchanged complete backs out without PUT", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.url === "/catalog/groups") return Promise.resolve(catalog);
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [{ id: "bts", nameZh: "防弹少年团" }] });
    return Promise.resolve({ groups: [] });
  };
  const page = pageWithData({});
  page.load();
  await flush();
  assert.equal(page.data.groups.filter((g) => g.selected).map((g) => g.id).join(","), "bts");

  page.complete();
  await flush();
  assert.equal(backs.length, 1);
  assert.equal(calls.filter((c) => c.method === "PUT").length, 0);

  page.onClear();
  assert.deepEqual(page.data.groups.filter((g) => g.selected), []);
});

test("ME07 changed complete PUTs follows; manage mode has no 1–3 cap", async () => {
  const calls = [];
  api.request = (opts) => {
    calls.push(opts);
    if (opts.url === "/catalog/groups") return Promise.resolve(catalog);
    if (opts.url === "/me/follows") return Promise.resolve({ groups: [] });
    if (opts.method === "PUT") return Promise.resolve({ groups: [] });
    return Promise.resolve({});
  };
  const page = pageWithData({});
  page.load();
  await flush();
  page.onToggle({ detail: { id: "h2h" } });
  page.onToggle({ detail: { id: "bts" } });
  page.onToggle({ detail: { id: "aespa" } });
  assert.equal(page.data.groups.filter((g) => g.selected).length, 3);
  page.complete();
  await flush();
  const put = calls.find((c) => c.method === "PUT" && c.url === "/me/follows");
  assert.ok(put);
  assert.equal(put.data.groupIds.length, 3);
  assert.equal(backs.length, 1);
});

after(() => {
  api.request = origRequest;
});
