/**
 * UGC-2b 服务端宫格切分回退（jsfeat 同一套投影，无大模型）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { splitPhotocardGrid, CV_LIBRARY } from "../src/gridSplit.js";

async function makeGridJpeg(n: 2 | 3) {
  const cellW = 80;
  const cellH = 120;
  const gutter = 12;
  const margin = 16;
  const w = margin * 2 + n * cellW + (n - 1) * gutter;
  const h = margin * 2 + n * cellH + (n - 1) * gutter;
  const overlays: { input: Buffer; left: number; top: number }[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const buf = await sharp({
        create: {
          width: cellW,
          height: cellH,
          channels: 3,
          background: { r: 20 + r * 40, g: 40 + c * 50, b: 90 + r * 20 },
        },
      })
        .png()
        .toBuffer();
      overlays.push({
        input: buf,
        left: margin + c * (cellW + gutter),
        top: margin + r * (cellH + gutter),
      });
    }
  }
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 245, g: 245, b: 248 } },
  })
    .composite(overlays)
    .jpeg({ quality: 92 })
    .toBuffer();
}

test("CV library name is jsfeat", () => {
  assert.equal(CV_LIBRARY, "jsfeat");
});

test("splitPhotocardGrid 4-cell synthetic", async () => {
  const buf = await makeGridJpeg(2);
  const res = await splitPhotocardGrid({
    imageBase64: buf.toString("base64"),
    mimeType: "image/jpeg",
    cells: 4,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal((res.boxes as unknown[]).length, 4);
  assert.equal(res.library, "jsfeat");
  assert.equal(res.fallback, true);
});

test("rejects cells other than 4/9", async () => {
  const buf = await makeGridJpeg(2);
  await assert.rejects(
    () =>
      splitPhotocardGrid({
        imageBase64: buf.toString("base64"),
        mimeType: "image/jpeg",
        cells: 6,
      }),
    /4 或 9/,
  );
});
