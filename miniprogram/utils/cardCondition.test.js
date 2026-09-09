/**
 * PR-P1-4 / O06 card condition helpers
 * run: node --test miniprogram/utils/cardCondition.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  CONDITIONS,
  conditionLabel,
  clampQuantity,
  toPatchBody,
  QTY_MIN,
  NOTES_MAX,
} = require("./cardCondition");

test("conditions include 未填写 and 全新..较差 keys", () => {
  assert.equal(CONDITIONS[0].value, "");
  assert.equal(CONDITIONS[0].label, "未填写");
  assert.deepEqual(
    CONDITIONS.filter((c) => c.value).map((c) => c.value),
    ["mint", "near_mint", "excellent", "good", "poor"],
  );
});

test("conditionLabel maps API enum to 品相", () => {
  assert.equal(conditionLabel("mint"), "全新");
  assert.equal(conditionLabel("near_mint"), "近全新");
  assert.equal(conditionLabel(null), "未填写");
  assert.equal(conditionLabel(""), "未填写");
});

test("clampQuantity stays ≥1 and ≤99", () => {
  assert.equal(clampQuantity(0), QTY_MIN);
  assert.equal(clampQuantity(-3), 1);
  assert.equal(clampQuantity(2.9), 2);
  assert.equal(clampQuantity(100), 99);
  assert.equal(clampQuantity("4"), 4);
});

test("toPatchBody sends null condition and keeps notes text", () => {
  assert.deepEqual(toPatchBody({ quantity: 2, condition: "", notes: "抽卡" }), {
    quantity: 2,
    condition: null,
    notes: "抽卡",
  });
  assert.equal(NOTES_MAX, 500);
});
