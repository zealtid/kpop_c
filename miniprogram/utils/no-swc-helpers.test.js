/**
 * WeChat SWC (es6+enhance, base ~3.17) injects require('@swc/helpers/_/_array_with_holes')
 * for array destructuring. Those helpers are not in the mini-program runtime.
 * Pack path = miniprogram/ excluding *.test.js (see project.config.json packOptions).
 * run: node --test miniprogram/utils/no-swc-helpers.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function walkJs(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walkJs(full, out);
      continue;
    }
    if (!ent.name.endsWith(".js")) continue;
    if (ent.name.endsWith(".test.js")) continue;
    out.push(full);
  }
  return out;
}

test("packed miniprogram JS has no @swc/helpers and no array destructuring", () => {
  const files = walkJs(ROOT, []);
  assert.ok(files.length > 0);
  const hits = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (/@swc\/helpers|_array_with_holes|_sliced_to_array|_iterable_to_array|_non_iterable_rest/.test(src)) {
      hits.push(`${rel}: @swc/helpers`);
    }
    if (/\(\s*\[[^\]=]+\]\s*\)\s*=>/.test(src)) {
      hits.push(`${rel}: array-destructure param`);
    }
    if (/(?:const|let|var)\s+\[[^\]=]+\]\s*=/.test(src)) {
      hits.push(`${rel}: array-destructure assign`);
    }
  }
  assert.deepEqual(hits, []);
});

test("cold start stays cardbook; intel Tab + lazyCodeLoading kept", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  assert.equal(appJson.pages[0], "pages/cardbook/index");
  assert.equal(appJson.lazyCodeLoading, "requiredComponents");
  assert.equal(appJson.tabBar.list[0].pagePath, "pages/feed/index");
  assert.equal(appJson.tabBar.list[0].text, "情报");
  assert.ok(appJson.pages.includes("pages/feed/index"));
  assert.ok(appJson.pages.includes("pages/schedule/index"));
  assert.ok(appJson.pages.includes("pages/settings/index"));
  assert.ok(appJson.pages.includes("pages/follow-manage/index"));
});

test("UX-A does not use getUserProfile as nickname path", () => {
  const files = walkJs(ROOT, []);
  const hits = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (/getUserProfile/.test(src)) hits.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
  assert.deepEqual(hits, []);
});
