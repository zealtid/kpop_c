import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Internal family name of api/assets/fonts/NotoSansSC-Share.otf */
export const SHARE_FONT_FAMILY = "Noto Sans SC";

const FONT_FILE = "NotoSansSC-Share.otf";
const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(here, "../assets/fonts", FONT_FILE);

let configured = false;

export function shareFontPath() {
  return FONT_PATH;
}

export function shareFontAttr() {
  return `font-family="${SHARE_FONT_FAMILY}"`;
}

/**
 * librsvg/cairo resolve SVG text through fontconfig, not CSS @font-face.
 * Must run before `sharp` is first imported so CJK is available on Railway/Linux.
 */
export function ensureShareFontconfig() {
  if (configured) return FONT_PATH;
  if (!fs.existsSync(FONT_PATH)) {
    throw new Error(`Share CJK font missing: ${FONT_PATH}`);
  }
  const confDir = path.join(os.tmpdir(), "xingka-fontconfig");
  fs.mkdirSync(confDir, { recursive: true });
  const cacheDir = path.join(confDir, "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const fontsDir = path.dirname(FONT_PATH);
  const confFile = path.join(confDir, "fonts.conf");
  const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>${fontsDir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <alias>
    <family>sans-serif</family>
    <prefer><family>${SHARE_FONT_FAMILY}</family></prefer>
  </alias>
  <alias>
    <family>Xingka Share Sans</family>
    <prefer><family>${SHARE_FONT_FAMILY}</family></prefer>
  </alias>
</fontconfig>
`;
  fs.writeFileSync(confFile, xml);
  process.env.FONTCONFIG_FILE = confFile;
  configured = true;
  return FONT_PATH;
}

ensureShareFontconfig();
