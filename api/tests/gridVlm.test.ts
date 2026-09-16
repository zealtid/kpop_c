/**
 * UGC-2b-VLM bbox 归一化 / JSON 解析（无网络、无密钥）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { completionText, extractJsonValue } from "../src/vlm/parse.js";
import { GRID_VLM_MAX_DETECT, normalizeVlmCards, xyxyToBox } from "../src/vlm/normalize.js";
import { resolveGridEngine } from "../src/gridSplit.js";

test("resolveGridEngine: default vlm; legacy 4/9 stays jsfeat", () => {
  assert.equal(resolveGridEngine({}), "vlm");
  assert.equal(resolveGridEngine({ engine: "vlm" }), "vlm");
  assert.equal(resolveGridEngine({ engine: "jsfeat", cells: 4 }), "jsfeat");
  assert.equal(resolveGridEngine({ cells: 4 }), "jsfeat");
  assert.equal(resolveGridEngine({ cells: 9 }), "jsfeat");
  assert.equal(resolveGridEngine({ cells: 6 }), "vlm");
});

test("extractJsonValue strips fences and prose", () => {
  const parsed = extractJsonValue('sure\n```json\n{"cards":[{"bbox":[0.1,0.2,0.3,0.4]}]}\n```\n');
  assert.equal((parsed as { cards: unknown[] }).cards.length, 1);
});

test("completionText reads OpenAI-shaped choices", () => {
  const text = completionText({
    choices: [{ message: { content: '{"cards":[]}' } }],
  });
  assert.equal(text, '{"cards":[]}');
});

test("normalize clamps, drops tiny, nms overlap", () => {
  const boxes = normalizeVlmCards({
    cards: [
      { bbox: [-0.2, 0.1, 1.4, 0.9], confidence: 0.2 },
      { bbox: [0.05, 0.08, 0.08, 0.1], confidence: 0.99 },
      { bbox: [0.1, 0.1, 0.4, 0.55], confidence: 0.8 },
      { bbox: [0.12, 0.12, 0.38, 0.52], confidence: 0.4 },
    ],
  });
  assert.ok(boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001));
  assert.ok(boxes.every((b) => b.w >= 0.05 && b.h >= 0.05));
  const mid = boxes.filter((b) => b.x >= 0.05 && b.x <= 0.15 && b.w < 0.4);
  assert.equal(mid.length, 1, "near-duplicate mid boxes should collapse");
});

test("normalize max 12 and xyxy", () => {
  const cards = [];
  for (let i = 0; i < 15; i++) {
    const x = (i % 5) * 0.18 + 0.02;
    const y = Math.floor(i / 5) * 0.28 + 0.02;
    cards.push({ bbox: [x, y, x + 0.16, y + 0.24], confidence: 0.5 });
  }
  const boxes = normalizeVlmCards({ cards });
  assert.equal(boxes.length, GRID_VLM_MAX_DETECT);
  assert.equal(boxes[0].index, 0);
  const xy = xyxyToBox([0.2, 0.3, 0.5, 0.8]);
  assert.equal(xy.x, 0.2);
  assert.ok(Math.abs(xy.w - 0.3) < 1e-9);
});

test("pixel-like coords scale with image size", () => {
  const boxes = normalizeVlmCards(
    { cards: [{ bbox: [10, 20, 110, 170] }] },
    { imgW: 200, imgH: 400 },
  );
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].x - 0.05) < 0.02);
  assert.ok(boxes[0].w > 0.4);
});
