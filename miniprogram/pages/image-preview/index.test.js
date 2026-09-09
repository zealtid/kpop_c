/**
 * M1.5.1 UX06 image-preview close
 * run: node --test miniprogram/pages/image-preview/index.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backs = [];
const toasts = [];

global.wx = {
  showToast(opts) {
    toasts.push(opts);
  },
  navigateBack() {
    backs.push(true);
  },
  navigateTo() {},
};

let pageDef;
global.Page = (def) => {
  pageDef = def;
};

require("./index.js");

const customCard = require("../../utils/customCard");

function pageWithData(data) {
  const page = {
    data: { ...pageDef.data, ...data },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
  for (const key of Object.keys(pageDef)) {
    if (typeof pageDef[key] === "function") {
      page[key] = pageDef[key].bind(page);
    }
  }
  return page;
}

beforeEach(() => {
  backs.length = 0;
  toasts.length = 0;
  customCard.clearPreviewSrc();
});

test("preview page uses movable-view scale and tap-to-close", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /movable-view/);
  assert.match(wxml, /scale-max="4"/);
  assert.match(wxml, /bindtap="close"/);
});

test("loads src from session and close returns", () => {
  customCard.openFullscreen("https://x/front.jpg");
  const page = pageWithData(pageDef.data);
  page.onLoad();
  assert.equal(page.data.src, "https://x/front.jpg");
  page.close();
  assert.equal(backs.length, 1);
});
