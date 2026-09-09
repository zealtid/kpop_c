/**
 * M1.5.1 crop page: confirm required, no skip
 * run: node --test miniprogram/pages/image-crop/index.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const backs = [];

global.wx = {
  showToast(opts) {
    toasts.push(opts);
  },
  navigateBack() {
    backs.push(true);
  },
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667 };
  },
  getImageInfo(opts) {
    if (opts.success) opts.success({ width: 400, height: 300 });
  },
  createCanvasContext() {
    return {
      setFillStyle() {},
      fillRect() {},
      drawImage() {},
      draw(_r, cb) {
        if (cb) cb();
      },
    };
  },
  canvasToTempFilePath(opts) {
    if (opts.success) opts.success({ tempFilePath: "tmp://cropped.jpg" });
  },
};

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const crop = require("../../utils/crop");

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
  backs.length = 0;
  crop.cancelSession();
});

test("wxml has confirm crop and no skip/original action", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /bindtap="confirm">确认裁剪/);
  assert.match(wxml, /不可跳过/);
  assert.doesNotMatch(wxml, /跳过|使用原图|自由比例/);
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(js, /crop\.CROP_ASPECT/);
});

test("onLoad without session goes back; with session lays out 2:3", () => {
  const page = pageWithData(pageDef.data);
  page.onLoad();
  assert.equal(toasts[0].title, "请先选择照片");
  crop.beginSession("tmp://orig.jpg");
  const page2 = pageWithData(pageDef.data);
  page2.onLoad();
  assert.equal(page2.data.src, "tmp://orig.jpg");
  assert.equal(page2.data.aspectLabel, "2:3");
  assert.ok(page2.data.frameH > page2.data.frameW);
  assert.equal(page2.data.outW / page2.data.outH, 2 / 3);
});

test("confirm writes cropped path not the original", async () => {
  crop.beginSession("tmp://orig.jpg");
  const page = pageWithData(pageDef.data);
  page.onLoad();
  page.confirm();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(crop.getSession().croppedPath, "tmp://cropped.jpg");
  assert.ok(page._confirmed);
  assert.equal(backs.length, 1);
});
