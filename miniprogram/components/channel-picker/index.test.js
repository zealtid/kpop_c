/**
 * 特典/通路底部选择器（投稿 + 宫格确认共用）
 * run: node --test miniprogram/components/channel-picker/index.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("sheet lists library options with search and 其他/手填", () => {
  const wxml = fs.readFileSync(path.join(__dirname, "index.wxml"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const wxss = fs.readFileSync(path.join(__dirname, "index.wxss"), "utf8");
  assert.match(wxml, /选择特典/);
  assert.doesNotMatch(wxml, /选择通路 \/ 特典/);
  assert.match(wxml, /仅显示图鉴库里已有的特典/);
  assert.match(wxml, /bindinput="onQuery"/);
  assert.match(wxml, /wx:for="\{\{hits\}\}"/);
  assert.match(wxml, /wx:key="key"/);
  assert.match(wxml, /图鉴特典/);
  assert.match(wxml, /otherOn/);
  assert.match(js, /filterOptions/);
  assert.match(js, /triggerEvent\("pick"/);
  assert.match(wxss, /z-index:\s*1000/);
  assert.match(wxss, /position:\s*fixed/);
});
