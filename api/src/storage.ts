import fs from "node:fs";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { config } from "./config.js";
import { badRequest } from "./errors.js";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2000;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isBucketConfigured() {
  return !!(
    config.bucket &&
    config.bucketEndpoint &&
    config.bucketAccessKeyId &&
    config.bucketSecretAccessKey
  );
}

let s3: S3Client | null = null;

function getS3() {
  if (!isBucketConfigured()) return null;
  if (!s3) {
    s3 = new S3Client({
      region: config.bucketRegion || "sin",
      endpoint: config.bucketEndpoint,
      credentials: {
        accessKeyId: config.bucketAccessKeyId,
        secretAccessKey: config.bucketSecretAccessKey,
      },
      // S3 兼容存储对默认 checksum 较敏感
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return s3;
}

export function publicMediaPath(userId: string, fileName: string) {
  return `/media/custom/${userId}/${fileName}`;
}

export function absoluteMediaUrl(publicPath: string) {
  if (/^https?:\/\//.test(publicPath)) return publicPath;
  return `${config.publicBaseUrl}${publicPath}`;
}

function keyFromPublicPath(publicPath: string) {
  const rel = publicPath.replace(/^\/media\/custom\//, "");
  return `custom/${rel}`;
}

function localPathFromPublic(publicPath: string) {
  const rel = publicPath.replace(/^\/media\/custom\//, "");
  return path.join(config.dataDir, "custom", rel);
}

export function parseImagePayload(input: {
  base64?: string;
  buffer?: Buffer;
  mimeType?: string;
}) {
  let buf: Buffer | null = input.buffer || null;
  let mime = (input.mimeType || "").toLowerCase();
  if (!buf && input.base64) {
    const raw = String(input.base64);
    const dataUrl = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
      mime = dataUrl[1].toLowerCase();
      buf = Buffer.from(dataUrl[2], "base64");
    } else {
      buf = Buffer.from(raw, "base64");
    }
  }
  if (!buf || buf.length === 0) throw badRequest("请上传正面卡图");
  if (buf.length > MAX_BYTES) throw badRequest("图片不能超过 8MB");
  if (mime === "image/jpg") mime = "image/jpeg";
  if (mime && !MIME_EXT[mime]) throw badRequest("仅支持 jpeg / png / webp");
  return { buffer: buf, mimeType: mime || "image/jpeg" };
}

export async function normalizeImage(buffer: Buffer, mimeType: string) {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest("无法识别的图片");
  }
  const format = meta.format;
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw badRequest("仅支持 jpeg / png / webp");
  }
  let pipeline = sharp(buffer).rotate();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w > MAX_EDGE || h > MAX_EDGE) {
    pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true });
  }
  if (format === "png") {
    const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer: out, contentType: "image/png", ext: "png" };
  }
  if (format === "webp") {
    const out = await pipeline.webp({ quality: 85 }).toBuffer();
    return { buffer: out, contentType: "image/webp", ext: "webp" };
  }
  const out = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return { buffer: out, contentType: "image/jpeg", ext: "jpg" };
}

export async function saveCustomImage(opts: {
  userId: string;
  id: string;
  buffer: Buffer;
  mimeType?: string;
  side?: "front" | "back";
}) {
  const parsed = parseImagePayload({ buffer: opts.buffer, mimeType: opts.mimeType });
  const normalized = await normalizeImage(parsed.buffer, parsed.mimeType);
  const side = opts.side === "back" ? "back" : "front";
  const fileName = `${opts.id}-${side}.${normalized.ext}`;
  const publicPath = publicMediaPath(opts.userId, fileName);
  const key = keyFromPublicPath(publicPath);
  const client = getS3();
  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: normalized.buffer,
        ContentType: normalized.contentType,
      }),
    );
  } else {
    const dest = localPathFromPublic(publicPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, normalized.buffer);
  }
  return { publicPath, contentType: normalized.contentType, key };
}

export async function readCustomImage(publicPath: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!publicPath.startsWith("/media/custom/")) return null;
  const client = getS3();
  if (client) {
    try {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: keyFromPublicPath(publicPath),
        }),
      );
      const bytes = out.Body ? await out.Body.transformToByteArray() : null;
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType: out.ContentType || "image/jpeg",
      };
    } catch {
      return null;
    }
  }
  const dest = localPathFromPublic(publicPath);
  if (!fs.existsSync(dest)) return null;
  const ext = path.extname(dest).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { body: fs.readFileSync(dest), contentType };
}

export async function deleteCustomImage(publicPath: string | null | undefined) {
  if (!publicPath || !publicPath.startsWith("/media/custom/")) return;
  const client = getS3();
  if (client) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: keyFromPublicPath(publicPath),
        }),
      );
    } catch {
      // 删除文件失败不阻断删行
    }
    return;
  }
  const dest = localPathFromPublic(publicPath);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
}

export function isSafeCustomMediaParams(userId: string, file: string) {
  return (
    /^[0-9a-f-]{36}$/i.test(userId) &&
    /^[0-9a-f-]{36}-(front|back)\.(jpe?g|png|webp)$/i.test(file)
  );
}
