/**
 * M1.5.1 + UX-C crop math (UX01/UX02 / PCX01–PCX03)
 * run: node --test miniprogram/utils/crop.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crop = require("./crop");

beforeEach(() => {
  crop.cancelSession();
});

test("PCX01 crop aspect is locked 2:3 and configurable in one module", () => {
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

test("PCX02 dampTranslate allows overshoot then less than raw delta", () => {
  const hard = crop.clampTranslate(80, 0, 1, 400, 300, 200, 300);
  assert.equal(hard.x, 0);
  const damped = crop.dampTranslate(80, 0, 1, 400, 300, 200, 300);
  assert.ok(damped.x > hard.x);
  assert.ok(damped.x < 80);
  const rubber = crop.rubberDelta(80);
  assert.ok(rubber < 80);
  assert.ok(rubber > 0);
});

test("PCX02 dampScale resists going below cover / above max", () => {
  const min = 1;
  assert.equal(crop.dampScale(1.2, min), 1.2);
  assert.equal(crop.clampScale(0.2, min), min);
  const below = crop.dampScale(0.2, min);
  assert.ok(below < min);
  assert.ok(below > 0.2);
  const max = min * crop.MAX_SCALE_FACTOR;
  const above = crop.dampScale(max + 2, min);
  assert.ok(above > max);
  assert.ok(above < max + 2);
});

test("PCX03 large images downsample for preview; small images stay 1:1", () => {
  const small = crop.previewSize(800, 1200);
  assert.equal(small.downsampled, false);
  assert.equal(small.width, 800);
  assert.equal(small.scale, 1);
  const big = crop.previewSize(4000, 6000);
  assert.equal(big.downsampled, true);
  assert.equal(Math.max(big.width, big.height), crop.PREVIEW_MAX_EDGE);
  assert.ok(big.scale < 1);
  assert.ok(Math.abs(big.width / big.height - 4000 / 6000) < 0.01);
});

test("exportDrawArgs maps frame coords onto output canvas", () => {
  const args = crop.exportDrawArgs(-100, 0, 400, 300, 200, 800);
  assert.equal(args.dx, -400);
  assert.equal(args.dy, 0);
  assert.equal(args.dWidth, 1600);
  assert.equal(args.dHeight, 1200);
});

test("session: crop result is consumed once; original remains for recrop", () => {
  crop.beginSession("wxfile://tmp/orig.jpg");
  assert.equal(crop.getSession().src, "wxfile://tmp/orig.jpg");
  assert.equal(crop.peekOriginal(), "wxfile://tmp/orig.jpg");
  assert.equal(crop.consumeCroppedPath(), "");
  crop.beginSession("wxfile://tmp/orig.jpg");
  crop.setCroppedPath("wxfile://tmp/crop.jpg");
  assert.equal(crop.consumeCroppedPath(), "wxfile://tmp/crop.jpg");
  assert.equal(crop.consumeCroppedPath(), "");
  assert.equal(crop.peekOriginal(), "wxfile://tmp/orig.jpg");
  crop.beginSession("wxfile://tmp/orig.jpg");
  crop.cancelSession();
  assert.equal(crop.getSession(), null);
  assert.equal(crop.peekOriginal(), "");
});
