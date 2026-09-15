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

test("wxml uses 名称/别称, agreement checkbox, and 特典 picker sheet", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "index.json"), "utf8"));
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxml, /名称\/别称/);
  assert.doesNotMatch(wxml, /卡位 \/ 名称/);
  assert.match(wxml, /class="agree/);
  assert.match(wxml, /bindtap="toggleAgree"/);
  assert.match(wxml, /channel-picker/);
  assert.match(wxml, /openChannelPicker/);
  assert.match(wxml, /点选库里的特典/);
  assert.doesNotMatch(wxml, /通路 \/ 特典/);
  assert.match(wxml, /class="channel-ph"/);
  assert.doesNotMatch(wxml, /bindinput="onChannelQ"/);
  assert.match(wxml, /class="faces-row"/);
  assert.match(wxml, /class="face-col"/);
  assert.match(wxml, /class="card-face"/);
  assert.match(wxss, /\.faces-row/);
  assert.match(wxss, /display:\s*flex/);
  assert.match(wxss, /\.chips/);
  assert.match(wxss, /\.box/);
  assert.match(wxss, /\.channel-field \{[\s\S]*?height:\s*72rpx/);
  assert.match(wxss, /\.channel-ph/);
  assert.equal(json.usingComponents["channel-picker"], "/components/channel-picker/index");
});

test("opening picker and picking a library option updates display", () => {
  const page = pageWithData({
    channelOptions: [
      { value: "weverse", label: "Weverse Shop", aliases: ["WV"], kind: "channel" },
    ],
    channelPickerOpen: false,
  });
  page.openChannelPicker();
  assert.equal(page.data.channelPickerOpen, true);
  page.onChannelPicked({ detail: { value: "weverse", label: "Weverse Shop", other: false } });
  assert.equal(page.data.channelValue, "weverse");
  assert.equal(page.data.channelDisplay, "Weverse Shop");
  assert.equal(page.data.channelPickerOpen, false);
  page.onChannelPicked({ detail: { value: "__other__", label: "其他/手填", other: true } });
  assert.equal(page.data.channelOther, true);
  assert.equal(page.data.channelPickerOpen, true);
  page.onChannelCustomEvt({ detail: { custom: "店庆特典" } });
  assert.equal(page.data.channelDisplay, "店庆特典");
});

test("app.json registers submit and my-submissions", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.ok(appJson.pages.includes("pages/catalog-submit/index"));
  assert.ok(appJson.pages.includes("pages/my-submissions/index"));
  assert.ok(appJson.pages.includes("pages/my-submissions/detail"));
});
