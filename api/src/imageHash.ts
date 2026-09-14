import sharp from "sharp";

const NEAR_DUP_HAMMING = 12;
export const CLARITY_EXTREME = 8;
export const CLARITY_WARN = 40;

export type ImageWarning = { code: string; message: string };

export async function computeDHash(buffer: Buffer): Promise<string> {
  const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += raw[y * 9 + x] < raw[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export function isNearDuplicate(a: string, b: string) {
  return hammingHex(a, b) <= NEAR_DUP_HAMMING;
}

export async function luminanceVariance(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer)
    .grayscale()
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = data.length || 1;
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / n;
  let acc = 0;
  for (const v of data) acc += (v - mean) ** 2;
  return acc / n;
}

export async function clarityWarnings(buffer: Buffer): Promise<{ variance: number; warnings: ImageWarning[] }> {
  const variance = await luminanceVariance(buffer);
  const warnings: ImageWarning[] = [];
  if (variance < CLARITY_WARN) {
    warnings.push({ code: "LOW_CLARITY", message: "图片可能过暗或不够清晰，建议重拍后再提交" });
  }
  return { variance, warnings };
}
