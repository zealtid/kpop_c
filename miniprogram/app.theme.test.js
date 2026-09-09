/**
 * Scheme A light theme — TH01–TH06
 * run: node --test miniprogram/app.theme.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname);
const THEME = path.join(ROOT, "styles/theme.wxss");
const APP_WXSS = path.join(ROOT, "app.wxss");
const APP_JSON = path.join(ROOT, "app.json");

const TOKENS = {
  "--color-bg-page": "#F4F5F9",
  "--color-bg-elevated": "#FFFFFF",
  "--color-bg-muted": "#EBEDF3",
  "--color-text-primary": "#1A1B1F",
  "--color-text-secondary": "#667085",
  "--color-text-tertiary": "#98A2B3",
  "--color-text-inverse": "#FFFFFF",
  "--color-border-subtle": "#E4E7EC",
  "--color-brand": "#6B5CFF",
  "--color-brand-soft": "#EDE9FF",
  "--color-brand-pressed": "#5A4BE0",
  "--color-success": "#12B76A",
  "--color-warning": "#F79009",
  "--color-danger": "#F04438",
  "--color-badge-own": "#12B76A",
  "--color-badge-want": "#6B5CFF",
  "--color-progress-track": "#EDE9FF",
  "--color-progress-fill": "#6B5CFF",
  "--color-button-primary-bg": "#6B5CFF",
  "--color-button-primary-text": "#FFFFFF",
  "--color-button-secondary-bg": "#FFFFFF",
  "--color-button-secondary-border": "#D0D5DD",
  "--color-button-secondary-text": "#1A1B1F",
};

const DARK_HEX = /#121016|#1c1824|#1a1620|#2a2233|#3a3344|#241c28|#3a2a20|#ff6b9d|#ff8fb8|#f4f1f6|#a9a3b3|#f5c36b/i;
const OVERLAY = /rgba\(\s*18\s*,\s*16\s*,\s*22/i;

function walk(dir, pred, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "brand") continue;
      walk(full, pred, out);
      continue;
    }
    if (pred(ent.name, full)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

test("TH01 forced light tokens live in styles/theme.wxss and app.wxss imports them", () => {
  const theme = fs.readFileSync(THEME, "utf8");
  const appWxss = fs.readFileSync(APP_WXSS, "utf8");
  assert.match(appWxss, /@import ["']styles\/theme\.wxss["']/);
  assert.match(appWxss, /background:\s*var\(--color-bg-page\)/);
  const names = Object.keys(TOKENS);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const value = TOKENS[name];
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*" + value, "i");
    assert.match(theme, re, name);
  }
});

test("TH02 elevated surfaces use --color-bg-elevated", () => {
  const appWxss = fs.readFileSync(APP_WXSS, "utf8");
  assert.match(appWxss, /\.card\s*\{[^}]*background:\s*var\(--color-bg-elevated\)/s);
  assert.match(appWxss, /\.empty-state\s*\{[^}]*background:\s*var\(--color-bg-elevated\)/s);
  const cardbook = fs.readFileSync(path.join(ROOT, "pages/cardbook/index.wxss"), "utf8");
  assert.match(cardbook, /background:\s*var\(--color-bg-elevated\)/);
  const feed = fs.readFileSync(path.join(ROOT, "pages/feed/index.wxss"), "utf8");
  assert.match(feed, /background:\s*var\(--color-bg-elevated\)/);
});

test("TH03 photocard grids have no dark image overlay", () => {
  const files = walk(
    ROOT,
    (name) => name.endsWith(".wxss") || name.endsWith(".wxml"),
    [],
  );
  const hits = [];
  for (let i = 0; i < files.length; i += 1) {
    const src = fs.readFileSync(files[i], "utf8");
    if (OVERLAY.test(src)) hits.push(rel(files[i]));
  }
  assert.deepEqual(hits, []);
  const ph = fs.readFileSync(APP_WXSS, "utf8");
  assert.doesNotMatch(ph, /\.ph[^{]*\{[^}]*linear-gradient/s);
});

test("TH04 cardbook/catalog/feed/mine consume tokens; progress + own/want badges", () => {
  const cardbook = fs.readFileSync(path.join(ROOT, "pages/cardbook/index.wxss"), "utf8");
  assert.match(cardbook, /--color-progress-track/);
  assert.match(cardbook, /--color-progress-fill/);
  const catalogGroup = fs.readFileSync(path.join(ROOT, "pages/catalog-group/index.wxss"), "utf8");
  assert.match(catalogGroup, /--color-brand/);
  const catalogWxml = fs.readFileSync(path.join(ROOT, "pages/catalog-group/index.wxml"), "utf8");
  assert.match(catalogWxml, /class="own"/);
  assert.match(catalogWxml, /class="want"/);
  const appWxss = fs.readFileSync(APP_WXSS, "utf8");
  assert.match(appWxss, /--color-badge-own/);
  assert.match(appWxss, /--color-badge-want/);
  const mineWxml = fs.readFileSync(path.join(ROOT, "pages/mine/index.wxml"), "utf8");
  assert.match(mineWxml, /class="btn"/);
  const catalogWxss = fs.readFileSync(path.join(ROOT, "pages/catalog/index.wxss"), "utf8");
  assert.match(catalogWxss, /app\.wxss/);
});

test("TH05 tabBar + primary/secondary buttons; IA unchanged", () => {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON, "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.equal(appJson.tabBar.list.length, 4);
  assert.equal(appJson.tabBar.list[0].text, "情报");
  assert.equal(appJson.tabBar.list[1].text, "卡册");
  assert.equal(appJson.tabBar.list[2].text, "图鉴");
  assert.equal(appJson.tabBar.list[3].text, "我的");
  assert.equal(appJson.tabBar.color.toUpperCase(), "#667085");
  assert.equal(appJson.tabBar.selectedColor.toUpperCase(), "#6B5CFF");
  assert.equal(appJson.tabBar.backgroundColor.toUpperCase(), "#FFFFFF");
  const appWxss = fs.readFileSync(APP_WXSS, "utf8");
  assert.match(appWxss, /\.btn\s*\{[^}]*--color-button-primary-bg/s);
  assert.match(appWxss, /\.btn\.ghost\s*\{[^}]*--color-button-secondary-bg/s);
  const iconSrc = fs.readFileSync(path.join(ROOT, "../api/scripts/gen-mp-icons.ts"), "utf8");
  assert.match(iconSrc, /#6B5CFF/);
  assert.match(iconSrc, /#667085/);
  assert.doesNotMatch(iconSrc, /#ff6b9d/i);
});

test("TH06 light navigation bar and dark text style", () => {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON, "utf8"));
  assert.equal(appJson.window.navigationBarBackgroundColor.toUpperCase(), "#FFFFFF");
  assert.equal(appJson.window.navigationBarTextStyle, "black");
  assert.equal(appJson.window.backgroundColor.toUpperCase(), "#F4F5F9");
  assert.equal(appJson.window.backgroundTextStyle, "dark");
  const preview = JSON.parse(
    fs.readFileSync(path.join(ROOT, "pages/image-preview/index.json"), "utf8"),
  );
  assert.equal(preview.navigationBarTextStyle, "white");
});

test("chrome wxss/wxml/json drop legacy dark/pink palette (lightbox canvas may stay #000)", () => {
  const files = walk(
    ROOT,
    (name) =>
      (name.endsWith(".wxss") || name.endsWith(".wxml") || name.endsWith(".json")) &&
      !name.endsWith(".test.js"),
    [],
  );
  const hits = [];
  for (let i = 0; i < files.length; i += 1) {
    const src = fs.readFileSync(files[i], "utf8");
    if (DARK_HEX.test(src)) hits.push(rel(files[i]));
  }
  assert.deepEqual(hits, []);
});
