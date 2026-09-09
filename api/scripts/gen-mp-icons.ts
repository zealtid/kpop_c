import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../miniprogram/assets");
fs.mkdirSync(dest, { recursive: true });

const icons = [
  { name: "tab-feed", glyph: "i", on: false },
  { name: "tab-feed-on", glyph: "i", on: true },
  { name: "tab-book", glyph: "B", on: false },
  { name: "tab-book-on", glyph: "B", on: true },
  { name: "tab-catalog", glyph: "G", on: false },
  { name: "tab-catalog-on", glyph: "G", on: true },
  { name: "tab-mine", glyph: "M", on: false },
  { name: "tab-mine-on", glyph: "M", on: true },
];

for (const icon of icons) {
  const color = icon.on ? "#ff6b9d" : "#8a8494";
  const svg = `<svg width="81" height="81" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40.5" cy="40.5" r="28" fill="none" stroke="${color}" stroke-width="6"/>
    <text x="40.5" y="48" text-anchor="middle" font-size="26" font-family="sans-serif" fill="${color}">${icon.glyph}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(dest, `${icon.name}.png`));
}
console.log("wrote tab icons", dest);
