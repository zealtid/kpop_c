/**
 * M1.5.1 + UX-C crop page: confirm required, locked 2:3, preview downsample
 * run: node --test miniprogram/pages/image-crop/index.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const backs = [];
const compressCalls = [];

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
  compressImage(opts) {
    compressCalls.push(opts);
    if (opts.success) opts.success({ tempFilePath: `${opts.src}.prev` });
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
  compressCalls.length = 0;
  crop.cancelSession();
});

test("PCX01 wxml has confirm crop, 2:3 preset highlight, no free-aspect", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /bindtap="confirm">确认裁剪/);
  assert.match(wxml, /不可跳过/);
  assert.match(wxml, /aspectLocked/);
  assert.match(wxml, /translate3d/);
  assert.doesNotMatch(wxml, /使用原图|自由比例|跳过裁剪/);
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(js, /crop\.CROP_ASPECT/);
  assert.match(js, /previewSize/);
  assert.match(js, /dampTranslate/);
  assert.doesNotMatch(js, /freeAspect|CROP_ASPECT\s*=/);
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
  assert.equal(page2.data.aspectLocked, true);
  assert.ok(page2.data.frameH > page2.data.frameW);
  assert.equal(page2.data.outW / page2.data.outH, 2 / 3);
  assert.equal(compressCalls.length, 0);
});

test("PCX03 large image compresses preview; confirm still exports output size", async () => {
  const origGetInfo = global.wx.getImageInfo;
  global.wx.getImageInfo = (opts) => {
    if (opts.success) opts.success({ width: 4000, height: 6000 });
  };
  crop.beginSession("tmp://huge.jpg");
  const page = pageWithData(pageDef.data);
  page.onLoad();
  assert.equal(compressCalls.length, 1);
  assert.equal(page.data.src, "tmp://huge.jpg.prev");
  assert.equal(page._origSrc, "tmp://huge.jpg");
  assert.equal(page.data.outW, crop.OUTPUT_WIDTH);
  page.confirm();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(crop.getSession().croppedPath, "tmp://cropped.jpg");
  assert.ok(page._confirmed);
  global.wx.getImageInfo = origGetInfo;
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

test("PCX02 touch end snaps damped pan back inside the frame", () => {
  crop.beginSession("tmp://orig.jpg");
  const page = pageWithData(pageDef.data);
  page.onLoad();
  page.applyTransform(page.data.scale, 80, 0, true);
  assert.ok(page.data.tx > 0);
  page.onTouchEnd();
  assert.equal(page.data.tx, 0);
});
