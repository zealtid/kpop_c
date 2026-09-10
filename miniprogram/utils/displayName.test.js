/**
 * ME01–ME04 display name helpers
 * run: node --test miniprogram/utils/displayName.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const displayName = require("./displayName");

test("ME01/ME03 unset and 收藏家 show 点击设置昵称, not 收藏家", () => {
  assert.equal(displayName.displayNickname(""), "点击设置昵称");
  assert.equal(displayName.displayNickname(null), "点击设置昵称");
  assert.equal(displayName.displayNickname("收藏家"), "点击设置昵称");
  assert.equal(displayName.displayNickname(" 收藏家 "), "点击设置昵称");
  assert.ok(displayName.isUnsetNickname("收藏家"));
  assert.ok(displayName.isUnsetNickname(""));
});

test("ME01 real WeChat / app nickname is shown as-is", () => {
  assert.equal(displayName.displayNickname("星卡用户"), "星卡用户");
  assert.equal(displayName.displayNickname("  IU  "), "IU");
  assert.equal(displayName.isUnsetNickname("星卡用户"), false);
});

test("ME04 local custom name requires confirm before WeChat sync overwrite", () => {
  assert.equal(displayName.shouldConfirmWxSync("星卡用户"), true);
  assert.equal(displayName.shouldConfirmWxSync("收藏家"), false);
  assert.equal(displayName.shouldConfirmWxSync(""), false);
  assert.equal(displayName.normalizeDraft("  超长昵称012345678901234567890123456789  ").length, 32);
});
