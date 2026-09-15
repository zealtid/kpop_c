/**
 * UGC-2b 宫格入册入口
 * run: node --test miniprogram/pages/catalog-grid/index.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("app.json registers grid pages", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app.json"), "utf8"));
  assert.ok(appJson.pages.includes("pages/catalog-grid/index"));
  assert.ok(appJson.pages.includes("pages/catalog-grid/confirm"));
});

test("entry copy and 4/9 picker", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  assert.match(wxml, /宫格入册/);
  assert.match(wxml, /四宫/);
  assert.match(wxml, /九宫/);
  assert.match(wxml, /pickAlbum/);
  assert.match(wxml, /pickCamera/);
});

test("confirm has adjust/delete/rotate and no private-only", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "confirm.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "confirm.js"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "confirm.wxss"), "utf8");
  assert.match(wxml, /rotateSelected/);
  assert.match(wxml, /deleteSelected/);
  assert.match(wxml, /onHandleStart/);
  assert.match(wxml, /确认入册/);
  assert.match(wxml, /提交进度/);
  assert.match(wxml, /channel-picker/);
  assert.match(wxml, /openChannelPicker/);
  assert.match(wxml, /点选库里的特典/);
  assert.doesNotMatch(wxml, /通路 \/ 特典/);
  assert.match(wxml, /class="channel-ph"/);
  assert.match(wxss, /\.channel-field \{[\s\S]*?height:\s*72rpx/);
  assert.doesNotMatch(wxml, /仅私人|私人保存/);
  assert.match(js, /matchOwnIfDuplicate:\s*true/);
  assert.match(js, /source:\s*"grid_page"/);
  assert.doesNotMatch(js, /custom-cards/);
});

test("catalog and mine expose 宫格入册", () => {
  const catalog = fs.readFileSync(path.join(__dirname, "../catalog/index.wxml"), "utf8");
  const mine = fs.readFileSync(path.join(__dirname, "../mine/index.wxml"), "utf8");
  assert.match(catalog, /宫格入册/);
  assert.match(mine, /宫格入册/);
  assert.match(catalog, /goGrid/);
  assert.match(mine, /goGrid/);
});
