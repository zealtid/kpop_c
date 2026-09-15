import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { badRequest } from "./errors.js";
import { parseImagePayload } from "./storage.js";

const require = createRequire(import.meta.url);
const gridDetect = require(
  path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../miniprogram/utils/gridDetect.js"),
) as {
  CV_LIBRARY: string;
  DETECT_MAX_EDGE: number;
  detectGridFromRgba: (
    rgba: Uint8Array,
    width: number,
    height: number,
    cells: number,
  ) => {
    ok: boolean;
    reason?: string;
    boxes: { x: number; y: number; w: number; h: number; index: number }[];
    confidence: number;
    library: string;
    method: string;
    cells?: number;
  };
  pixelBox: (
    box: { x: number; y: number; w: number; h: number },
    imgW: number,
    imgH: number,
  ) => { sx: number; sy: number; sw: number; sh: number };
  gridSide: (cells: number) => number;
};

export const CV_LIBRARY = gridDetect.CV_LIBRARY;

function cellsOrThrow(raw: unknown) {
  const n = Number(raw);
  if (n === 4 || n === 9) return n as 4 | 9;
  throw badRequest("仅支持 4 或 9 宫格");
}

export async function splitPhotocardGrid(
  body: { imageBase64?: string; mimeType?: string; cells?: unknown; includeCrops?: boolean },
) {
  const cells = cellsOrThrow(body.cells);
  const parsed = parseImagePayload({ base64: body.imageBase64, mimeType: body.mimeType });
  const max = gridDetect.DETECT_MAX_EDGE;
  const { data, info } = await sharp(parsed.buffer)
    .rotate()
    .resize(max, max, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = gridDetect.detectGridFromRgba(data, info.width, info.height, cells);
  const payload: Record<string, unknown> = {
    ok: result.ok,
    reason: result.reason || null,
    cells,
    boxes: result.boxes,
    confidence: result.confidence,
    library: result.library,
    method: result.method,
    fallback: true,
  };
  if (body.includeCrops && result.ok) {
    payload.crops = await cropBoxes(parsed.buffer, result.boxes);
  }
  return payload;
}

async function cropBoxes(
  buffer: Buffer,
  boxes: { x: number; y: number; w: number; h: number; index: number }[],
) {
  const meta = await sharp(buffer).rotate().metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const out: { index: number; imageBase64: string }[] = [];
  for (const box of boxes) {
    const px = gridDetect.pixelBox(box, w, h);
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
