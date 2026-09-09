const { test } = require("node:test");
const assert = require("node:assert/strict");
const customCard = require("./customCard");

test("custom badge and count label", () => {
  assert.equal(customCard.CUSTOM_BADGE, "自定义");
  assert.equal(customCard.customCountLabel(0), "自定义");
  assert.equal(customCard.customCountLabel(3), "自定义 3 张");
});

test("pending is collection+share; rejected is neither", () => {
  assert.equal(customCard.moderationBadge("pending"), "审核中");
  assert.equal(customCard.inNormalCollection("pending"), true);
  assert.equal(customCard.inShareImage("pending"), true);
  assert.equal(customCard.inNormalCollection("approved"), true);
  assert.equal(customCard.inShareImage("rejected"), false);
  assert.equal(customCard.inNormalCollection("rejected"), false);
});
