import sharp from "sharp";
import { gridVlmConfig } from "./config.js";
import { badRequest, tooManyRequests } from "./errors.js";
import {
  CV_LIBRARY,
  DETECT_MAX_EDGE,
  detectGridFromRgba,
  pixelBox,
  type GridBox,
} from "./gridDetectCore.js";
import { parseImagePayload } from "./storage.js";
import {
  cardsPayload,
  consumeGridVlmQuota,
  createGridVlmProvider,
  GRID_VLM_DETECT_PROMPT,
  GRID_VLM_MAX_DETECT,
  normalizeVlmResult,
  readVlmDetectLog,
  recordGridVlmCall,
  type DetectedGridCard,
  type GridEngine,
  type GridVlmProvider,
} from "./vlm/index.js";

export { CV_LIBRARY };

function cellsOrThrow(raw: unknown) {
  const n = Number(raw);
  if (n === 4 || n === 9) return n as 4 | 9;
  throw badRequest("仅支持 4 或 9 宫格");
}

/**
 * Resolve engine. New MP always sends engine=vlm.
 * Legacy clients posted cells 4/9 with no engine → keep jsfeat so they do not break.
 */
export function resolveGridEngine(body: { engine?: unknown; cells?: unknown }): GridEngine {
  const engine = String(body.engine || "").trim().toLowerCase();
  if (engine === "jsfeat" || engine === "cv") return "jsfeat";
  if (engine === "vlm" || engine === "doubao" || engine === "ark") return "vlm";
  const cells = Number(body.cells);
  if (cells === 4 || cells === 9) return "jsfeat";
  return "vlm";
}

export async function splitPhotocardGrid(
  body: {
    imageBase64?: string;
    mimeType?: string;
    cells?: unknown;
    includeCrops?: boolean;
    engine?: unknown;
    visionConsent?: unknown;
  },
  opts?: { userId?: string; provider?: GridVlmProvider },
) {
  const engine = resolveGridEngine(body || {});
  if (engine === "jsfeat") {
    // 高级 CV 入口不写入 grid_vlm_calls（仅 VLM 路径记审计）
    return splitWithJsfeat(body);
  }
  return splitWithVlm(body, opts);
}

async function splitWithJsfeat(body: {
  imageBase64?: string;
  mimeType?: string;
  cells?: unknown;
  includeCrops?: boolean;
}) {
  const cells = cellsOrThrow(body.cells);
  const parsed = parseImagePayload({ base64: body.imageBase64, mimeType: body.mimeType });
  const { data, info } = await sharp(parsed.buffer)
    .rotate()
    .resize(DETECT_MAX_EDGE, DETECT_MAX_EDGE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = detectGridFromRgba(data, info.width, info.height, cells);
  const payload: Record<string, unknown> = {
    ok: result.ok,
    reason: result.reason || null,
    cells,
    boxes: result.boxes,
    confidence: result.confidence,
    library: result.library,
    method: result.method,
    engine: "jsfeat",
    provider: "jsfeat",
    fallback: true,
    detectedCount: result.boxes.length,
    degrade: result.ok ? null : "ugc1",
  };
  if (body.includeCrops && result.ok) {
    payload.crops = await cropBoxes(parsed.buffer, result.boxes);
  }
  return payload;
}

async function splitWithVlm(
  body: {
    imageBase64?: string;
    mimeType?: string;
    includeCrops?: boolean;
    visionConsent?: unknown;
  },
  opts?: { userId?: string; provider?: GridVlmProvider },
) {
  if (body.visionConsent !== true && body.visionConsent !== "true" && body.visionConsent !== 1) {
    throw badRequest("请先同意将图片送至第三方视觉识别服务");
  }
  const parsed = parseImagePayload({ base64: body.imageBase64, mimeType: body.mimeType });
  const cfg = gridVlmConfig();
  const provider = opts?.provider || createGridVlmProvider();
  if (opts?.userId) {
    const quota = await consumeGridVlmQuota(opts.userId);
    if (!quota.ok) {
      await recordGridVlmCall({
        userId: opts.userId,
        provider: provider.id,
        model: cfg.model,
        ok: false,
        reason: "quota",
        detectedCount: 0,
        latencyMs: 0,
        degrade: null,
        promptText: GRID_VLM_DETECT_PROMPT,
      });
      throw tooManyRequests("今日识别次数已用完，请稍后再试", { count: quota.count, limit: quota.limit });
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const started = Date.now();
  let latencyMs = 0;
  try {
    const detected = await provider.detect({
      mimeType: parsed.mimeType,
      buffer: parsed.buffer,
      signal: controller.signal,
    });
    latencyMs = Date.now() - started;
    const meta = await sharp(parsed.buffer).rotate().metadata();
    const normalized = normalizeVlmResult(
      detected.cards?.length ? { cards: detected.cards } : detected.rawText || { cards: [] },
      { max: cfg.maxDetect || GRID_VLM_MAX_DETECT, imgW: meta.width, imgH: meta.height },
    );
    const boxes = normalized.boxes;
    const promptText = detected.promptText || GRID_VLM_DETECT_PROMPT;
    const rawText = detected.rawText || null;
    if (!boxes.length) {
      await recordGridVlmCall({
        userId: opts?.userId,
        provider: provider.id,
        model: cfg.model,
        ok: false,
        reason: "no_cards",
        detectedCount: 0,
        latencyMs,
        degrade: "ugc1",
        promptText,
        rawText,
      });
      return vlmFailPayload("no_cards", provider.id, "没有识别到小卡，已改为单卡投稿");
    }
    const avg =
      boxes.reduce((s, b) => s + (b.confidence == null ? 0.7 : b.confidence), 0) / boxes.length;
    const versionHint = boxes.map((b) => b.versionLabel).find((v) => v);
    await recordGridVlmCall({
      userId: opts?.userId,
      provider: provider.id,
      model: cfg.model,
      ok: true,
      reason: null,
      detectedCount: boxes.length,
      latencyMs,
      degrade: null,
      meta: { boxCount: boxes.length, confidenceAvg: Math.min(1, avg) },
      promptText,
      rawText,
    });
    const payload: Record<string, unknown> = {
      ok: true,
      reason: null,
      engine: "vlm",
      provider: provider.id,
      library: provider.id,
      method: "ark-vision-bbox",
      fallback: false,
      detectedCount: boxes.length,
      truncated: normalized.truncated,
      rawDetectedCount: normalized.rawCount,
      maxDetect: cfg.maxDetect || GRID_VLM_MAX_DETECT,
      boxes,
      cards: cardsPayload(boxes),
      confidence: Math.min(1, avg),
      suggestions: { versionLabel: versionHint || null },
      degrade: null,
    };
    if (body.includeCrops) {
      payload.crops = await cropBoxes(parsed.buffer, boxes);
    }
    return payload;
  } catch (err) {
    latencyMs = Date.now() - started;
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : "";
    let reason = "vlm_fail";
    if (name === "AbortError" || name === "TimeoutError" || /aborted/i.test(message)) {
      reason = "timeout";
    } else if (name === "VlmUnconfiguredError" || message === "vlm_unconfigured") {
      reason = "vlm_unconfigured";
    }
    const failLog = readVlmDetectLog(err);
    await recordGridVlmCall({
      userId: opts?.userId,
      provider: provider.id,
      model: cfg.model,
      ok: false,
      reason,
      detectedCount: 0,
      latencyMs,
      degrade: "ugc1",
      promptText: failLog.promptText || GRID_VLM_DETECT_PROMPT,
      rawText: failLog.rawText || null,
    });
    if (reason === "timeout") {
      return vlmFailPayload("timeout", provider.id, "识别超时，已改为单卡投稿");
    }
    if (reason === "vlm_unconfigured") {
      return vlmFailPayload("vlm_unconfigured", provider.id, "视觉识别未配置，已改为单卡投稿");
    }
    return vlmFailPayload("vlm_fail", provider.id, "识别失败，已改为单卡投稿");
  } finally {
    clearTimeout(timer);
  }
}

function vlmFailPayload(reason: string, provider: string, message: string): Record<string, unknown> {
  return {
    ok: false,
    reason,
    message,
    engine: "vlm",
    provider,
    library: provider,
    method: "ark-vision-bbox",
    fallback: false,
    boxes: [] as DetectedGridCard[],
    cards: [],
    detectedCount: 0,
    confidence: 0,
    degrade: "ugc1" as const,
  };
}

async function cropBoxes(buffer: Buffer, boxes: GridBox[]) {
  const meta = await sharp(buffer).rotate().metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const out: { index: number; imageBase64: string }[] = [];
  for (const box of boxes) {
    const px = pixelBox(box, w, h);
    const sw = Math.min(px.sw, Math.max(1, w - px.sx));
    const sh = Math.min(px.sh, Math.max(1, h - px.sy));
    const buf = await sharp(buffer)
      .rotate()
      .extract({ left: px.sx, top: px.sy, width: sw, height: sh })
      .resize(600, 900, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    out.push({ index: box.index, imageBase64: buf.toString("base64") });
  }
  return out;
}

export { cellsOrThrow };
