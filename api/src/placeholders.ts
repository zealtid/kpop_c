import { shareFontAttr } from "./shareFont.js";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";

export async function writePlaceholderCard(opts: {
  code: string;
  color: string;
  member: string;
  version: string;
  group: string;
}): Promise<string> {
  const dir = path.join(config.dataDir, "cards");
  fs.mkdirSync(dir, { recursive: true });
  const file = `${opts.code.replace(/[^A-Za-z0-9_-]/g, "_")}.png`;
  const dest = path.join(dir, file);
  if (fs.existsSync(dest)) return `/media/cards/${file}`;
  const font = shareFontAttr();
  const svg = `<svg width="330" height="510" xmlns="http://www.w3.org/2000/svg">
    <rect width="330" height="510" rx="18" fill="${opts.color}"/>
    <text x="165" y="70" fill="#ffffffaa" font-size="16" text-anchor="middle" ${font}>${escapeXml(opts.group)}</text>
    <text x="165" y="250" fill="#fff" font-size="32" text-anchor="middle" ${font}>${escapeXml(opts.member)}</text>
    <text x="165" y="292" fill="#fff" font-size="20" text-anchor="middle" ${font}>${escapeXml(opts.version)}</text>
    <text x="165" y="460" fill="#ffffffcc" font-size="12" text-anchor="middle" ${font}>${escapeXml(opts.code)}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(dest);
  return `/media/cards/${file}`;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
