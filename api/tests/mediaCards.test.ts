/**
 * 公开图鉴主图 GET /media/cards 走 readStoredImage（本地 dataDir，不依赖 Postgres）。
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { isSafeCardsMediaFile } from "../src/storage.js";

let server: Server;
let base = "";
const fileName = "unit-ugc-front.jpg";
const dest = path.join(config.dataDir, "cards", fileName);

before(async () => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = await sharp({
    create: { width: 80, height: 120, channels: 3, background: { r: 40, g: 80, b: 160 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  fs.writeFileSync(dest, buf);
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
});

test("isSafeCardsMediaFile rejects path traversal", () => {
  assert.equal(isSafeCardsMediaFile("ugc-abcd1234-front.jpg"), true);
  assert.equal(isSafeCardsMediaFile("bts-rm-std.png"), true);
  assert.equal(isSafeCardsMediaFile("../secret.jpg"), false);
  assert.equal(isSafeCardsMediaFile("a/b.jpg"), false);
  assert.equal(isSafeCardsMediaFile("noext"), false);
});

test("GET /media/cards serves local file with image content-type", async () => {
  const res = await fetch(`${base}/media/cards/${fileName}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /^image\/jpeg/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.length > 50);
});

test("GET /media/cards rejects traversal and missing files", async () => {
  const missing = await fetch(`${base}/media/cards/does-not-exist.jpg`);
  assert.equal(missing.status, 404);
  const traversal = await fetch(`${base}/media/cards/${encodeURIComponent("../package.json")}`);
  assert.equal(traversal.status, 404);
});
