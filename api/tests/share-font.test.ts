import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  SHARE_FONT_FAMILY,
  ensureShareFontconfig,
  shareFontPath,
} from "../src/shareFont.js";

const execFileAsync = promisify(execFile);
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiRoot, "..");

test("share SVG wiring uses bundled Noto Sans SC, not generic sans-serif", () => {
  const fontPath = shareFontPath();
  assert.equal(path.basename(fontPath), "NotoSansSC-Share.otf");
  assert.ok(fs.existsSync(fontPath), `missing ${fontPath}`);
  assert.ok(fs.statSync(fontPath).size > 100_000);

  const conf = ensureShareFontconfig();
  assert.equal(conf, fontPath);
  const fc = process.env.FONTCONFIG_FILE;
  assert.ok(fc && fs.existsSync(fc));
  const xml = fs.readFileSync(fc, "utf8");
  assert.match(xml, /Noto Sans SC/);
  assert.match(xml, /assets\/fonts/);

  const shareSrc = fs.readFileSync(path.join(apiRoot, "src/share.ts"), "utf8");
  assert.match(shareSrc, /shareFontAttr/);
  assert.match(shareSrc, /我的\$\{escapeXml\(opts\.groupName\)\}卡册/);
  assert.match(shareSrc, /星卡 · 卡册长图/);
  assert.match(shareSrc, /微信扫码打开小程序/);
  assert.match(shareSrc, /分享图含水印与小程序码/);
  assert.doesNotMatch(shareSrc, /font-family="sans-serif"/);

  assert.equal(SHARE_FONT_FAMILY, "Noto Sans SC");
});

test("librsvg renders CJK when fontconfig can only see the bundled font", async () => {
  const fontPath = shareFontPath();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xingka-share-fc-"));
  const fontDir = path.join(tmp, "fonts");
  const cacheDir = path.join(tmp, "cache");
  fs.mkdirSync(fontDir);
  fs.mkdirSync(cacheDir);
  const localFont = path.join(fontDir, path.basename(fontPath));
  fs.copyFileSync(fontPath, localFont);
  const confFile = path.join(tmp, "fonts.conf");
  fs.writeFileSync(
    confFile,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <alias>
    <family>sans-serif</family>
    <prefer><family>${SHARE_FONT_FAMILY}</family></prefer>
  </alias>
</fontconfig>
`,
  );

  const script = `
import sharp from "sharp";
const sample = "星卡 · 我的Hearts2Hearts卡册 微信扫码打开小程序 0/80";
const svg = \`<svg width="900" height="160" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="160" fill="#121016"/>
  <text x="24" y="96" fill="#ffffff" font-size="36" font-family="${SHARE_FONT_FAMILY}">\${sample}</text>
</svg>\`;
const buf = await sharp(Buffer.from(svg)).png().toBuffer();
process.stdout.write(String(buf.length));
`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FONTCONFIG_FILE: confFile,
  };
  delete env.FONTCONFIG_PATH;
  const { stdout } = await execFileAsync("node", ["--input-type=module", "--eval", script], {
    cwd: repoRoot,
    env,
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
  const bytes = Number(stdout.trim());
  // System-font CJK sample is ~10KB; missing-glyph / tofu renders stay ~1KB.
  assert.ok(bytes > 6000, `expected CJK PNG, got ${bytes} bytes`);
});
