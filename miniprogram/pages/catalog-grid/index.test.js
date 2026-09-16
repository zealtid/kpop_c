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

test("entry exposes AI vs 手动四宫/九宫, not only advanced fold", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxml, /宫格入册/);
  assert.match(wxml, /AI 切图/);
  assert.match(wxml, /不规则多卡/);
  assert.doesNotMatch(wxml, /最多 16 张/);
  assert.match(wxml, /手动四宫\/九宫/);
  assert.match(wxml, /pickCutMode/);
  assert.match(wxml, /data-mode="ai"/);
  assert.match(wxml, /data-mode="manual"/);
  assert.doesNotMatch(wxml, /高级：手动/);
  assert.doesNotMatch(wxml, /收起手动规则宫格/);
  assert.match(js, /cutMode/);
  assert.match(js, /engine:\s*"vlm"/);
  assert.match(js, /visionConsent:\s*true/);
  assert.match(js, /GRID_VLM_QUOTA/);
  assert.match(js, /识别中…/);
  assert.match(wxml, /第三方视觉识别/);
  assert.match(wxml, /未勾选不可识别/);
  assert.match(wxml, /toggleConsent/);
  assert.match(wxml, /四宫/);
  assert.match(wxml, /九宫/);
  assert.match(wxml, /pickAlbum/);
  assert.match(wxml, /pickCamera/);
  assert.match(wxss, /\.mode-row/);
  assert.doesNotMatch(js, /ARK_API_KEY/);
});

test("confirm has adjust/delete/rotate, optional version, match-own, safety submit cap", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "confirm.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "confirm.js"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "confirm.wxss"), "utf8");
  assert.match(wxml, /rotateSelected/);
  assert.match(wxml, /deleteSelected/);
  assert.match(wxml, /onHandleStart/);
  assert.match(wxml, /确认入册/);
  assert.match(wxml, /识别到 \{\{detectedCount\}\} 张/);
  assert.match(wxml, /一次最多提交 \{\{maxSubmit\}\} 张/);
  assert.match(wxml, /版本（选填）/);
  assert.match(wxml, /特典（选填）/);
  assert.match(wxml, /图鉴已有直接入柜/);
  assert.match(js, /maxSubmit/);
  assert.match(js, /请选择专辑/);
  assert.doesNotMatch(js, /请填写专辑和版本/);
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
  assert.doesNotMatch(js, /ARK_API_KEY/);
  assert.match(js, /TRUNCATE_TOAST/);
});

test("catalog and mine expose 宫格入册", () => {
  const catalog = fs.readFileSync(path.join(__dirname, "../catalog/index.wxml"), "utf8");
  const mine = fs.readFileSync(path.join(__dirname, "../mine/index.wxml"), "utf8");
  assert.match(catalog, /宫格入册/);
  assert.match(mine, /宫格入册/);
  assert.match(catalog, /goGrid/);
  assert.match(mine, /goGrid/);
});
