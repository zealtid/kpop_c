/**
 * UGC-2b jsfeat 宫格切分
 * run: node --test miniprogram/utils/gridDetect.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const gridDetect = require("./gridDetect");

function paintGrid(n, w, h) {
  const gray = new Uint8Array(w * h);
  gray.fill(250);
  const gutter = 10;
  const margin = 16;
  const cellW = Math.floor((w - margin * 2 - gutter * (n - 1)) / n);
  const cellH = Math.floor((h - margin * 2 - gutter * (n - 1)) / n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x0 = margin + c * (cellW + gutter);
      const y0 = margin + r * (cellH + gutter);
      const tone = 30 + (r * n + c) * 35;
      for (let y = y0; y < y0 + cellH; y++) {
        for (let x = x0; x < x0 + cellW; x++) {
          gray[y * w + x] = (x + y) % 5 === 0 ? Math.min(220, tone + 80) : tone;
        }
      }
    }
  }
  return gray;
}

test("library is jsfeat and only 4/9", () => {
  assert.equal(gridDetect.CV_LIBRARY, "jsfeat");
  assert.equal(gridDetect.gridSide(4), 2);
  assert.equal(gridDetect.gridSide(9), 3);
  assert.equal(gridDetect.gridSide(6), 0);
});

test("detects synthetic 4-grid", () => {
  const w = 240;
  const h = 360;
  const found = gridDetect.detectGridFromGray(paintGrid(2, w, h), w, h, 4);
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.equal(found.boxes.length, 4);
  assert.equal(found.library, "jsfeat");
});

test("detects synthetic 9-grid", () => {
  const w = 300;
  const h = 450;
  const found = gridDetect.detectGridFromGray(paintGrid(3, w, h), w, h, 9);
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.equal(found.boxes.length, 9);
});

test("uniform image is not a grid", () => {
  const w = 120;
  const h = 180;
  const gray = new Uint8Array(w * h);
  gray.fill(128);
  const found = gridDetect.detectGridFromGray(gray, w, h, 4);
  assert.equal(found.ok, false);
});

test("clamp / overlay / rotate / edge drag", () => {
  const box = gridDetect.clampBox({ x: -0.2, y: 0.1, w: 2, h: 0.2 });
  assert.ok(box.x >= 0 && box.x + box.w <= 1.0001);
  const ov = gridDetect.overlayBoxes([{ x: 0, y: 0, w: 0.5, h: 0.5, index: 0 }], 100, 200);
  assert.equal(ov[0].width, 50);
  assert.equal(ov[0].height, 100);
  assert.equal(gridDetect.nextRotation(0), 90);
  assert.equal(gridDetect.nextRotation(270), 0);
  const moved = gridDetect.applyEdgeDelta({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "e", 0.1, 0);
  assert.ok(moved.w > 0.4);
});
