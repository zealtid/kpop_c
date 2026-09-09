/**
 * M1.5.1 UX01-UX05 custom-card-add: forced crop + optional member
 * run: node --test miniprogram/pages/custom-card-add/index.test.js
 */
const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const navigations = [];
const chooseCalls = [];
const readFiles = [];

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
  navigateBack() {},
  chooseMedia(opts) {
    chooseCalls.push({ api: "chooseMedia", ...opts });
    const src = (opts.sourceType || []).join(",");
    if (opts.success) opts.success({ tempFiles: [{ tempFilePath: `tmp://${src}.jpg` }] });
  },
  chooseImage() {},
  getFileSystemManager() {
    return {
      readFile(opts) {
        readFiles.push(opts);
        if (opts.success) opts.success({ data: "base64-crop" });
      },
    };
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
const crop = require("../../utils/crop");
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
  chooseCalls.length = 0;
  readFiles.length = 0;
  crop.cancelSession();
  api.request = (opts) => {
    if (String(opts.url).includes("/members")) {
      return Promise.resolve({
        members: [
          { id: "m-rm", groupId: "g-bts", nameEn: "RM", nameZh: "RM" },
          { id: "m-v", groupId: "g-bts", nameEn: "V", nameZh: "뷔" },
        ],
      });
    }
    return Promise.resolve({ groups: [{ id: "g-bts", nameZh: "防弹少年团" }] });
  };
});

test("app.json registers crop and preview pages; add page is not a tab", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.ok(appJson.pages.includes("pages/image-crop/index"));
  assert.ok(appJson.pages.includes("pages/image-preview/index"));
  assert.ok(appJson.pages.includes("pages/custom-card-add/index"));
  const tabs = (appJson.tabBar.list || []).map((t) => t.pagePath);
  assert.ok(!tabs.includes("pages/image-crop/index"));
});

test("wxml forces 2:3 crop, album+camera, optional member skip", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /bindtap="pickAlbum"/);
  assert.match(wxml, /bindtap="pickCamera"/);
  assert.match(wxml, /必须裁剪，不可跳过/);
  assert.match(wxml, /wx:if="\{\{showMembers\}\}"/);
  assert.match(wxml, /bindtap="pickMember"/);
  assert.match(wxml, />不指定</);
  assert.doesNotMatch(wxml, /跳过裁剪|使用原图/);
});

test("UX01 album pick navigates to crop and does not preview original", () => {
  const page = pageWithData({});
  page.pickAlbum();
  assert.equal(chooseCalls[0].sourceType[0], "album");
  assert.equal(navigations[0].url, "/pages/image-crop/index");
  assert.equal(page.data.preview, "");
  assert.equal(crop.getSession().src, "tmp://album.jpg");
});

test("UX02 camera pick uses the same crop page", () => {
  const page = pageWithData({});
  page.pickCamera();
  assert.equal(chooseCalls[0].sourceType[0], "camera");
  assert.equal(navigations[0].url, "/pages/image-crop/index");
  assert.equal(crop.getSession().src, "tmp://camera.jpg");
});

test("onShow applies cropped path only, never the original", () => {
  const page = pageWithData({ preview: "" });
  crop.beginSession("tmp://orig.jpg");
  page.onShow();
  assert.equal(page.data.preview, "");
  crop.beginSession("tmp://orig.jpg");
  crop.setCroppedPath("tmp://crop.jpg");
  page.onShow();
  assert.equal(page.data.preview, "tmp://crop.jpg");
  assert.equal(page._cropped, true);
  assert.equal(page._filePath, "tmp://crop.jpg");
});

test("save without crop is blocked; save after crop uploads crop file", () => {
  const page = pageWithData({ saving: false, title: "x", groupId: "", memberId: "" });
  page.save();
  assert.equal(toasts.some((t) => t.title === "请先裁剪照片"), true);
  assert.equal(readFiles.length, 0);

  page._cropped = true;
  page._filePath = "tmp://crop.jpg";
  page.data.memberId = "m-rm";
  page.data.groupId = "g-bts";
  page.save();
  assert.equal(readFiles[0].filePath, "tmp://crop.jpg");
});

test("UX03 skip member posts memberId null; UX04 posts selected member", async () => {
  const requests = [];
  api.request = (opts) => {
    requests.push(opts);
    return Promise.resolve({});
  };
  const page = pageWithData({
    saving: false,
    title: "t",
    note: "",
    quantity: 1,
    condition: "",
    groupId: "g-bts",
    memberId: "",
  });
  page._cropped = true;
  page._filePath = "tmp://crop.jpg";
  page.save();
  await Promise.resolve();
  const body = requests.find((r) => r.method === "POST").data;
  assert.equal(body.memberId, null);
  assert.equal(body.groupId, "g-bts");
  assert.equal(body.imageFrontBase64, "base64-crop");

  requests.length = 0;
  page.data.saving = false;
  page.data.memberId = "m-rm";
  page.save();
  await Promise.resolve();
  assert.equal(requests[0].data.memberId, "m-rm");
});

test("UX05 changing group A→B clears member_id", async () => {
  const page = pageWithData({
    groupId: "g-bts",
    memberId: "m-rm",
    members: [{ id: "m-rm" }],
    showMembers: true,
  });
  page.pickGroup({ currentTarget: { dataset: { id: "g-h2h" } } });
  assert.equal(page.data.groupId, "g-h2h");
  assert.equal(page.data.memberId, "");
  await Promise.resolve();
  await Promise.resolve();
});

test("no group means no member step", () => {
  const page = pageWithData({ groupId: "g-bts", memberId: "m-rm", showMembers: true });
  page.pickGroup({ currentTarget: { dataset: { id: "" } } });
  assert.equal(page.data.showMembers, false);
  assert.equal(page.data.memberId, "");
});

after(() => {
  api.request = origRequest;
});
