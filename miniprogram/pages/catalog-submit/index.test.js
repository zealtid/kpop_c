/**
 * UGC-1 投稿页 / 申请入库入口
 * run: node --test miniprogram/pages/catalog-submit/index.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const navigations = [];

global.wx = {
  getStorageSync(key) {
    if (key === "ugc_submit_prefill") return {};
    return "";
  },
  setStorageSync() {},
  removeStorageSync() {},
  showToast(opts) {
    toasts.push(opts);
  },
  request() {},
  navigateTo(opts) {
    navigations.push(opts);
  },
  redirectTo(opts) {
    navigations.push(opts);
  },
  chooseMedia() {},
  chooseImage() {},
  getFileSystemManager() {
    return { readFile() {} };
  },
};

global.getApp = () => ({ globalData: { token: "t" }, login() {} });

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
    if (typeof pageDef[key] === "function") page[key] = pageDef[key].bind(page);
  }
  return page;
}

beforeEach(() => {
  toasts.length = 0;
  navigations.length = 0;
});

test("submit without agreement toasts", () => {
  const page = pageWithData({
    groupId: "g",
    releaseId: "r",
    versionLabel: "A",
    slotLabel: "卡",
    agreed: false,
  });
  page._frontPath = "tmp://a.jpg";
  page.submit();
  assert.equal(toasts[0].title, "请先勾选协议");
});

test("app.json registers submit and my-submissions", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.ok(appJson.pages.includes("pages/catalog-submit/index"));
  assert.ok(appJson.pages.includes("pages/my-submissions/index"));
  assert.ok(appJson.pages.includes("pages/my-submissions/detail"));
});
