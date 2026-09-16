/**
 * UGC-2b-VLM bbox 归一化 / JSON 解析 / Grounding `<bbox>`（无网络、无密钥）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ARK_VISION_MODEL, gridVlmConfig } from "../src/config.js";
import { cardsFromModelText, completionText, extractJsonValue, parseGroundingBboxes } from "../src/vlm/parse.js";
import { GRID_VLM_MAX_DETECT, GRID_VLM_MAX_SUBMIT, normalizeVlmCards, normalizeVlmResult, xyxyToBox } from "../src/vlm/normalize.js";
import { resolveGridEngine } from "../src/gridSplit.js";
import { GRID_VLM_LOG_TEXT_MAX_BYTES, sanitizeGridVlmLogText } from "../src/vlm/calls.js";
import { GRID_VLM_DETECT_PROMPT } from "../src/vlm/doubao.js";

test("default ARK_VISION_MODEL is grounding seed; ep ids pass through", () => {
  const prev = process.env.ARK_VISION_MODEL;
  const prevDetect = process.env.GRID_VLM_MAX_DETECT;
  const prevSubmit = process.env.GRID_VLM_MAX_SUBMIT;
  delete process.env.ARK_VISION_MODEL;
  delete process.env.GRID_VLM_MAX_DETECT;
  delete process.env.GRID_VLM_MAX_SUBMIT;
  try {
    assert.equal(DEFAULT_ARK_VISION_MODEL, "doubao-seed-2-0-lite-260215");
    assert.equal(gridVlmConfig().model, "doubao-seed-2-0-lite-260215");
    assert.equal(gridVlmConfig().maxDetect, 64);
    assert.equal(gridVlmConfig().maxSubmit, 64);
    process.env.GRID_VLM_MAX_DETECT = "32";
    process.env.GRID_VLM_MAX_SUBMIT = "48";
    assert.equal(gridVlmConfig().maxDetect, 32);
    assert.equal(gridVlmConfig().maxSubmit, 48);
    delete process.env.GRID_VLM_MAX_DETECT;
    delete process.env.GRID_VLM_MAX_SUBMIT;
    process.env.ARK_VISION_MODEL = "ep-20260916-demo";
    assert.equal(gridVlmConfig().model, "ep-20260916-demo");
  } finally {
    if (prev != null) process.env.ARK_VISION_MODEL = prev;
    else delete process.env.ARK_VISION_MODEL;
    if (prevDetect != null) process.env.GRID_VLM_MAX_DETECT = prevDetect;
    else delete process.env.GRID_VLM_MAX_DETECT;
    if (prevSubmit != null) process.env.GRID_VLM_MAX_SUBMIT = prevSubmit;
    else delete process.env.GRID_VLM_MAX_SUBMIT;
  }
});

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

test("parseGroundingBboxes reads 1000-space tags", () => {
  const tags = parseGroundingBboxes(
    "卡1<bbox>100 200 400 700</bbox>\n卡2<bbox>500,80,900,620</bbox>",
  );
  assert.equal(tags.length, 2);
  assert.deepEqual(tags[0].bbox, [100, 200, 400, 700]);
  assert.deepEqual(tags[1].bbox, [500, 80, 900, 620]);
});

test("cardsFromModelText works when JSON is absent", () => {
  const cards = cardsFromModelText("photocards:\n<bbox>120 80 480 640</bbox>");
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].bbox, [120, 80, 480, 640]);
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

test("normalize safety max keeps top-confidence and xyxy", () => {
  const cards = [];
  const total = GRID_VLM_MAX_DETECT + 6;
  for (let i = 0; i < total; i++) {
    const x = (i % 8) * 0.12 + 0.01;
    const y = Math.floor(i / 8) * 0.11 + 0.01;
    cards.push({ bbox: [x, y, x + 0.1, y + 0.1], confidence: i / total });
  }
  const result = normalizeVlmResult({ cards });
  assert.equal(GRID_VLM_MAX_DETECT, 64);
  assert.equal(GRID_VLM_MAX_SUBMIT, 64);
  assert.equal(result.truncated, true);
  assert.equal(result.rawCount, total);
  assert.equal(result.boxes.length, GRID_VLM_MAX_DETECT);
  assert.equal(result.boxes[0].index, 0);
  const keptConf = result.boxes.map((b) => b.confidence || 0);
  assert.ok(Math.min(...keptConf) >= 6 / total - 1e-9, "lowest-confidence extras dropped");
  const xy = xyxyToBox([0.2, 0.3, 0.5, 0.8]);
  assert.equal(xy.x, 0.2);
  assert.ok(Math.abs(xy.w - 0.3) < 1e-9);
  assert.equal(normalizeVlmCards({ cards }).length, GRID_VLM_MAX_DETECT);
});

test("Grounding 1000×1000 coords become 0–1 even if image size is known", () => {
  const boxes = normalizeVlmCards(
    { cards: [{ bbox: [100, 200, 400, 700] }] },
    { imgW: 2000, imgH: 3000 },
  );
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].x - 0.1) < 1e-9);
  assert.ok(Math.abs(boxes[0].y - 0.2) < 1e-9);
  assert.ok(Math.abs(boxes[0].w - 0.3) < 1e-9);
  assert.ok(Math.abs(boxes[0].h - 0.5) < 1e-9);
});

test("normalize raw Grounding text with multiple <bbox> tags", () => {
  const boxes = normalizeVlmCards(
    "小卡<bbox>50 60 250 360</bbox><bbox>400 80 720 560</bbox>",
  );
  assert.equal(boxes.length, 2);
  assert.ok(boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001));
  assert.ok(Math.abs(boxes[0].x - 0.05) < 1e-9);
});

test("pixel coords larger than 1000 scale with image size", () => {
  const boxes = normalizeVlmCards(
    { cards: [{ bbox: [200, 400, 2200, 3400] }] },
    { imgW: 4000, imgH: 5000 },
  );
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].x - 0.05) < 0.02);
  assert.ok(boxes[0].w > 0.4);
});

test("sanitizeGridVlmLogText strips data URL / keys and truncates", () => {
  assert.match(GRID_VLM_DETECT_PROMPT, /检出所有小卡/);
  const dirty = sanitizeGridVlmLogText(
    'hi data:image/jpeg;base64,AAAA Bearer sk-live-secretkey ark-abcdef0123456789 end',
  );
  assert.equal(dirty.truncated, false);
  assert.ok(dirty.text);
  assert.doesNotMatch(dirty.text!, /AAAA|sk-live|ark-abcdef|Bearer sk/i);
  assert.match(dirty.text!, /\[omitted-data-url\]/);
  assert.match(dirty.text!, /\[omitted-key\]/);

  const huge = "卡".repeat(GRID_VLM_LOG_TEXT_MAX_BYTES);
  const clipped = sanitizeGridVlmLogText(huge);
  assert.equal(clipped.truncated, true);
  assert.ok(clipped.text);
  assert.ok(Buffer.byteLength(clipped.text!, "utf8") <= GRID_VLM_LOG_TEXT_MAX_BYTES);
  assert.equal(sanitizeGridVlmLogText("").text, null);
  assert.equal(sanitizeGridVlmLogText(null).text, null);
});

test("Doubao prompt detects all photocards; no 16 product cap; no client keys in MP grid", async () => {
  const { readFile } = await import("node:fs/promises");
  const promptSrc = await readFile(new URL("../src/vlm/doubao.ts", import.meta.url), "utf8");
  assert.doesNotMatch(promptSrc, /最多 16 张/);
  assert.match(promptSrc, /检出所有小卡/);
  assert.match(promptSrc, /服务端可能只保留配置的上限张数/);
  const indexJs = await readFile(new URL("../../miniprogram/pages/catalog-grid/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(indexJs, /ARK_API_KEY/);
});
