/**
 * M1.5.1 crop math (UX01/UX02)
 * run: node --test miniprogram/utils/crop.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crop = require("./crop");

beforeEach(() => {
  crop.cancelSession();
});

test("crop aspect is 2:3 portrait and configurable in one module", () => {
  assert.equal(crop.CROP_ASPECT_W, 2);
  assert.equal(crop.CROP_ASPECT_H, 3);
  assert.equal(crop.CROP_ASPECT, 2 / 3);
  assert.equal(crop.CROP_ASPECT_LABEL, "2:3");
  assert.equal(crop.outputHeight(900), 1350);
  assert.equal(crop.OUTPUT_WIDTH / crop.outputHeight(), crop.CROP_ASPECT);
});

test("coverScale and initialTransform fill a 2:3 frame", () => {
  // 400x300 landscape covering 200x300 portrait → height-limited scale=1
  assert.equal(crop.coverScale(400, 300, 200, 300), 1);
  const t = crop.initialTransform(400, 300, 200, 300);
  assert.equal(t.scale, 1);
  assert.equal(t.x, -100);
  assert.equal(t.y, 0);
});

test("clampTranslate keeps image covering the frame (no gaps)", () => {
  const c = crop.clampTranslate(50, 20, 1, 400, 300, 200, 300);
  assert.equal(c.x, 0);
  assert.equal(c.y, 0);
  const left = crop.clampTranslate(-999, 0, 1, 400, 300, 200, 300);
  assert.equal(left.x, -200);
});

test("exportDrawArgs maps frame coords onto output canvas", () => {
  const args = crop.exportDrawArgs(-100, 0, 400, 300, 200, 800);
  assert.equal(args.dx, -400);
  assert.equal(args.dy, 0);
  assert.equal(args.dWidth, 1600);
  assert.equal(args.dHeight, 1200);
});

test("session: crop result is consumed once; cancel drops original", () => {
  crop.beginSession("wxfile://tmp/orig.jpg");
  assert.equal(crop.getSession().src, "wxfile://tmp/orig.jpg");
  assert.equal(crop.consumeCroppedPath(), "");
  crop.beginSession("wxfile://tmp/orig.jpg");
  crop.setCroppedPath("wxfile://tmp/crop.jpg");
  assert.equal(crop.consumeCroppedPath(), "wxfile://tmp/crop.jpg");
  assert.equal(crop.consumeCroppedPath(), "");
  crop.beginSession("wxfile://tmp/orig.jpg");
  crop.cancelSession();
  assert.equal(crop.getSession(), null);
});
