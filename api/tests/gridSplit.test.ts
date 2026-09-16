/**
 * UGC-2b 宫格切分：jsfeat 回退 + VLM 主路径（mock provider，无 Ark 密钥）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { splitPhotocardGrid, CV_LIBRARY, resolveGridEngine } from "../src/gridSplit.js";
import { MockGridVlmProvider } from "../src/vlm/index.js";

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

test("splitPhotocardGrid 4-cell synthetic (jsfeat fallback)", async () => {
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
  assert.equal(res.engine, "jsfeat");
});

test("jsfeat engine rejects cells other than 4/9", async () => {
  const buf = await makeGridJpeg(2);
  await assert.rejects(
    () =>
      splitPhotocardGrid({
        imageBase64: buf.toString("base64"),
        mimeType: "image/jpeg",
        engine: "jsfeat",
        cells: 6,
      }),
    /4 或 9/,
  );
});

test("VLM path requires vision consent", async () => {
  const buf = await makeGridJpeg(2);
  await assert.rejects(
    () =>
      splitPhotocardGrid({
        imageBase64: buf.toString("base64"),
        mimeType: "image/jpeg",
        engine: "vlm",
      }),
    /第三方视觉识别/,
  );
});

test("VLM mock 1000-space Grounding boxes normalize to 0–1", async () => {
  const buf = await makeGridJpeg(2);
  const res = await splitPhotocardGrid(
    {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    },
    {
      provider: new MockGridVlmProvider(async () => ({
        cards: [],
        rawText: "<bbox>80 100 420 620</bbox>\n<bbox>500 90 920 610</bbox>",
      })),
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.detectedCount, 2);
  const cards = res.cards as Array<{ bbox: number[] }>;
  assert.ok(cards.every((c) => c.bbox.every((n) => n >= 0 && n <= 1)));
  assert.ok(cards.some((c) => Math.abs(c.bbox[0] - 0.08) < 1e-9));
  assert.ok(cards.some((c) => Math.abs(c.bbox[0] - 0.5) < 1e-9));
});

test("VLM mock detects irregular boxes and suggestions", async () => {
  const buf = await makeGridJpeg(2);
  const res = await splitPhotocardGrid(
    {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    },
    {
      provider: new MockGridVlmProvider(async () => ({
        cards: [
          { bbox: [0.04, 0.06, 0.46, 0.52], confidence: 0.91, memberName: "Carmen", versionLabel: "POB" },
          { bbox: [0.52, 0.08, 0.94, 0.55], confidence: 0.88 },
        ],
      })),
    },
  );
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.engine, "vlm");
  assert.equal(res.fallback, false);
  assert.equal(res.detectedCount, 2);
  assert.equal((res.boxes as unknown[]).length, 2);
  const cards = res.cards as Array<{ bbox: number[]; memberName?: string }>;
  assert.equal(cards[0].bbox.length, 4);
  assert.equal((res.suggestions as { versionLabel?: string }).versionLabel, "POB");
  assert.ok(cards.every((c) => c.bbox.every((n) => n >= 0 && n <= 1)));
});

test("VLM timeout/fail degrades without throwing", async () => {
  const buf = await makeGridJpeg(2);
  const timeout = await splitPhotocardGrid(
    {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    },
    {
      provider: new MockGridVlmProvider(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    },
  );
  assert.equal(timeout.ok, false);
  assert.equal(timeout.degrade, "ugc1");
  assert.equal(timeout.reason, "timeout");

  const empty = await splitPhotocardGrid(
    {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    },
    {
      provider: new MockGridVlmProvider(async () => ({ cards: [] })),
    },
  );
  assert.equal(empty.ok, false);
  assert.equal(empty.degrade, "ugc1");
  assert.equal(empty.reason, "no_cards");
});

test("VLM unconfigured (no Ark key) degrades", async () => {
  assert.equal(resolveGridEngine({ engine: "vlm" }), "vlm");
  const prev = process.env.ARK_API_KEY;
  delete process.env.ARK_API_KEY;
  const buf = await makeGridJpeg(2);
  try {
    const res = await splitPhotocardGrid({
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    });
    assert.equal(res.ok, false);
    assert.equal(res.degrade, "ugc1");
    assert.equal(res.reason, "vlm_unconfigured");
  } finally {
    if (prev != null) process.env.ARK_API_KEY = prev;
    else delete process.env.ARK_API_KEY;
  }
});
