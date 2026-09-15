/**
 * Notion #16 page transitions — run: node --test miniprogram/utils/navigate.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

let calls;

function installWx(sys) {
  calls = [];
  global.wx = {
    getSystemInfoSync() {
      return sys || {};
    },
    navigateTo(opts) {
      calls.push({ method: "navigateTo", opts });
    },
    redirectTo(opts) {
      calls.push({ method: "redirectTo", opts });
    },
    navigateBack(opts) {
      calls.push({ method: "navigateBack", opts });
    },
    switchTab(opts) {
      calls.push({ method: "switchTab", opts });
    },
  };
}

const nav = require("./navigate");

beforeEach(() => {
  installWx({});
  nav.resetTapLock();
});

test("webview navigateTo does not attach Skyline routeConfig", () => {
  nav.navigateTo({ url: "/pages/card-detail/index?id=1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.url, "/pages/card-detail/index?id=1");
  assert.equal(calls[0].opts.routeConfig, undefined);
});

test("Skyline uses short routeConfig; low-end duration is 0", () => {
  installWx({ renderer: "skyline", benchmarkLevel: 24 });
  nav.resetTapLock();
  nav.navigateTo({ url: "/pages/catalog-submit/index" });
  assert.equal(calls[0].opts.routeConfig.transitionDuration, 220);
  assert.equal(calls[0].opts.routeConfig.reverseTransitionDuration, 180);

  installWx({ renderer: "skyline", benchmarkLevel: 6 });
  nav.resetTapLock();
  nav.navigateTo({ url: "/pages/catalog-submit/index" });
  assert.equal(calls[0].opts.routeConfig.transitionDuration, 0);
  assert.equal(calls[0].opts.routeConfig.reverseTransitionDuration, 0);
});

test("double-tap same navigateTo is ignored", () => {
  nav.navigateTo({ url: "/pages/mine/index" });
  nav.navigateTo({ url: "/pages/mine/index" });
  assert.equal(calls.length, 1);
});

test("app.json window paints page chrome during native push (no white flash)", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  assert.equal(appJson.window.backgroundColor.toUpperCase(), "#F4F5F9");
  assert.equal(appJson.window.backgroundColorContent.toUpperCase(), "#F4F5F9");
  assert.equal(appJson.window.backgroundColorTop.toUpperCase(), "#FFFFFF");
  assert.equal(appJson.window.backgroundColorBottom.toUpperCase(), "#F4F5F9");
  assert.equal(appJson.window.handleWebviewPreload, "static");
  assert.equal(appJson.darkmode, undefined);
});

test("lightbox keeps black chrome; main stacks use page bg", () => {
  const preview = JSON.parse(fs.readFileSync(path.join(ROOT, "pages/image-preview/index.json"), "utf8"));
  assert.equal(preview.backgroundColor.toUpperCase(), "#000000");
  assert.equal(preview.backgroundColorContent.toUpperCase(), "#000000");
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "pages/catalog/index.json"), "utf8"));
  assert.equal(catalog.backgroundColor.toUpperCase(), "#F4F5F9");
  const detail = JSON.parse(fs.readFileSync(path.join(ROOT, "pages/card-detail/index.json"), "utf8"));
  assert.equal(detail.backgroundColorContent.toUpperCase(), "#F4F5F9");
});

test("catalog / cardbook / mine rows have tap hover; reduced-motion CSS exists", () => {
  const catalog = fs.readFileSync(path.join(ROOT, "pages/catalog/index.wxml"), "utf8");
  const cardbook = fs.readFileSync(path.join(ROOT, "pages/cardbook/index.wxml"), "utf8");
  const mine = fs.readFileSync(path.join(ROOT, "pages/mine/index.wxml"), "utf8");
  assert.match(catalog, /hover-class="nav-hover"/);
  assert.match(cardbook, /hover-class="nav-hover"/);
  assert.match(mine, /hover-class="nav-hover"/);
  const appWxss = fs.readFileSync(path.join(ROOT, "app.wxss"), "utf8");
  assert.match(appWxss, /\.nav-hover/);
  assert.match(appWxss, /prefers-reduced-motion:\s*reduce/);
});
