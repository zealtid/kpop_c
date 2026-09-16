import { cardsFromModelText } from "./parse.js";
import type { DetectedGridCard, VlmCard } from "./types.js";

/** Technical safety ceiling (not a marketed product cap). Env: GRID_VLM_MAX_DETECT. */
export const GRID_VLM_MAX_DETECT = 64;
/** Technical safety ceiling (not a marketed product cap). Env: GRID_VLM_MAX_SUBMIT. */
export const GRID_VLM_MAX_SUBMIT = 64;
export const MIN_BOX_SIDE = 0.05;
export const MIN_BOX_AREA = 0.008;
const NMS_IOU = 0.65;

function clamp01(v: number) {
  const n = Number(v);
  if (!(n >= 0)) return 0;
  if (n > 1) return 1;
  return n;
}

function iou(a: DetectedGridCard, b: DetectedGridCard) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function nms(boxes: DetectedGridCard[]) {
  const sorted = [...boxes].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const kept: DetectedGridCard[] = [];
  for (const box of sorted) {
    if (kept.some((k) => iou(k, box) >= NMS_IOU)) continue;
    kept.push(box);
  }
  return kept;
}

function asCardsList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.cards)) return obj.cards;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.boxes)) return obj.boxes;
  }
  return [];
}

/**
 * Map model coords to 0–1.
 * Doubao Grounding uses a 1000×1000 grid — prefer /1000 when values fit (1.5, 1000],
 * even if image pixel size is also known. True pixel boxes (max > 1000) use imgW/imgH.
 */
function scaleCoords(vals: number[], dim?: number) {
  const max = Math.max(...vals.map((n) => Math.abs(Number(n) || 0)));
  if (max <= 1.5) return vals.map((n) => clamp01(Number(n)));
  if (max <= 1000) return vals.map((n) => clamp01(Number(n) / 1000));
  if (dim && dim > 1) return vals.map((n) => clamp01(Number(n) / dim));
  return vals.map((n) => clamp01(Number(n) / 1000));
}

function fourNums(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.length >= 4) {
    return [Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3])];
  }
  if (typeof raw === "string") {
    const parts = raw
      .replace(/<bbox>|<\/bbox>/gi, " ")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (parts.length >= 4) return parts.slice(0, 4);
  }
  return null;
}

function readBBox(item: Record<string, unknown>, imgW?: number, imgH?: number): [number, number, number, number] | null {
  const bbox = item.bbox ?? item.box ?? item.xyxy;
  const nums = fourNums(bbox);
  if (nums) {
    const xs = scaleCoords([nums[0], nums[2]], imgW);
    const ys = scaleCoords([nums[1], nums[3]], imgH);
    const x1 = xs[0];
    const x2 = xs[1];
    const y1 = ys[0];
    const y2 = ys[1];
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  }
  if (item.x != null && item.y != null && item.w != null && item.h != null) {
    const xs = scaleCoords([Number(item.x), Number(item.x) + Number(item.w)], imgW);
    const ys = scaleCoords([Number(item.y), Number(item.y) + Number(item.h)], imgH);
    return [xs[0], ys[0], xs[1], ys[1]];
  }
  return null;
}

export function xyxyToBox(bbox: [number, number, number, number]): { x: number; y: number; w: number; h: number } {
  const x1 = clamp01(bbox[0]);
  const y1 = clamp01(bbox[1]);
  const x2 = clamp01(bbox[2]);
  const y2 = clamp01(bbox[3]);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

export function boxToXyxy(box: { x: number; y: number; w: number; h: number }): [number, number, number, number] {
  return [clamp01(box.x), clamp01(box.y), clamp01(box.x + box.w), clamp01(box.y + box.h)];
}

export type NormalizedVlmCards = {
  boxes: DetectedGridCard[];
  truncated: boolean;
  rawCount: number;
};

function readingOrder(boxes: DetectedGridCard[]) {
  return [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
}

function reindex(boxes: DetectedGridCard[]) {
  return boxes.map((box, i) => ({ ...box, index: i }));
}

/** Keep highest-confidence boxes when over the detect safety ceiling. */
export function capDetectedCards(boxes: DetectedGridCard[], max: number): NormalizedVlmCards {
  const cap = Math.max(1, max);
  const rawCount = boxes.length;
  const truncated = rawCount > cap;
  const kept = truncated
    ? [...boxes].sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, cap)
    : boxes;
  return {
    boxes: reindex(readingOrder(kept)),
    truncated,
    rawCount,
  };
}

export function normalizeVlmResult(
  raw: unknown,
  opts?: { max?: number; imgW?: number; imgH?: number },
): NormalizedVlmCards {
  const max = opts?.max ?? GRID_VLM_MAX_DETECT;
  const source = typeof raw === "string" ? { cards: cardsFromModelText(raw) } : raw;
  const items = asCardsList(source);
  const mapped: DetectedGridCard[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const xyxy = readBBox(rec, opts?.imgW, opts?.imgH);
    if (!xyxy) continue;
    const box = xyxyToBox(xyxy);
    if (box.w < MIN_BOX_SIDE || box.h < MIN_BOX_SIDE || box.w * box.h < MIN_BOX_AREA) continue;
    const confRaw = rec.confidence ?? rec.score;
    const confidence = Number(confRaw);
    const memberName = String(rec.memberName || rec.member || rec.name || "").trim();
    const versionLabel = String(rec.versionLabel || rec.version || rec.benefit || "").trim();
    mapped.push({
      ...box,
      index: mapped.length,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : undefined,
      memberName: memberName || undefined,
      versionLabel: versionLabel || undefined,
    });
  }
  return capDetectedCards(nms(mapped), max);
}

export function normalizeVlmCards(
  raw: unknown,
  opts?: { max?: number; imgW?: number; imgH?: number },
): DetectedGridCard[] {
  return normalizeVlmResult(raw, opts).boxes;
}

export function cardsPayload(boxes: DetectedGridCard[]): VlmCard[] {
  return boxes.map((b) => ({
    bbox: boxToXyxy(b),
    confidence: b.confidence,
    memberName: b.memberName,
    versionLabel: b.versionLabel,
  }));
}
