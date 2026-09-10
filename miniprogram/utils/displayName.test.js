/**
 * UX-A / UX-A2 display name helpers
 * run: node --test miniprogram/utils/displayName.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const displayName = require("./displayName");

test("ME01/ME03 unset and 收藏家 show 未设置昵称, not 收藏家 or 点击设置昵称", () => {
  assert.equal(displayName.displayNickname(""), "未设置昵称");
  assert.equal(displayName.displayNickname(null), "未设置昵称");
  assert.equal(displayName.displayNickname("收藏家"), "未设置昵称");
  assert.equal(displayName.displayNickname(" 收藏家 "), "未设置昵称");
  assert.ok(displayName.isUnsetNickname("收藏家"));
  assert.ok(displayName.isUnsetNickname(""));
  assert.equal(displayName.UNSET_PLACEHOLDER, "未设置昵称");
});

test("ME01 real WeChat / app nickname is shown as-is", () => {
  assert.equal(displayName.displayNickname("星卡用户"), "星卡用户");
  assert.equal(displayName.displayNickname("  IU  "), "IU");
  assert.equal(displayName.isUnsetNickname("星卡用户"), false);
});

test("UX-A2 synced WeChat nickname is trimmed and capped before PATCH", () => {
  assert.equal(displayName.normalizeNickname("  IU  "), "IU");
  assert.equal(displayName.normalizeNickname("  超长昵称012345678901234567890123456789  ").length, 32);
});
