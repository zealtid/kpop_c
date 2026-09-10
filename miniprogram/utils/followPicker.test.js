/**
 * ME05 / ME07 follow picker helpers
 * run: node --test miniprogram/utils/followPicker.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const followPicker = require("./followPicker");

const groups = [
  { id: "h2h", nameZh: "Hearts2Hearts", nameEn: "H2H", aliases: "하츠투하츠,H2H", slug: "h2h", logoColor: "#f00" },
  { id: "bts", nameZh: "防弹少年团", nameEn: "BTS", nameKo: "방탄소년단", aliases: "防弹", slug: "bts", logoColor: "#00f" },
];

test("ME07 search matches nameZh / alias / en / ko", () => {
  assert.equal(followPicker.filterGroups(groups, "hearts").length, 1);
  assert.equal(followPicker.filterGroups(groups, "하츠").length, 1);
  assert.equal(followPicker.filterGroups(groups, "防弹").length, 1);
  assert.equal(followPicker.filterGroups(groups, "방탄").length, 1);
  assert.equal(followPicker.filterGroups(groups, "zzz").length, 0);
  assert.equal(followPicker.filterGroups(groups, "  ").length, 2);
});

test("ME07 clear checked state and unchanged detection", () => {
  const selected = groups.map((g) => ({ ...g, selected: g.id === "bts" }));
  assert.deepEqual(followPicker.selectedIds(selected), ["bts"]);
  assert.deepEqual(followPicker.selectedIds(followPicker.clearSelected(selected)), []);
  assert.equal(followPicker.sameIdSet(["bts", "h2h"], ["h2h", "bts"]), true);
  assert.equal(followPicker.sameIdSet(["bts"], ["h2h"]), false);
});

test("onboarding 1–3 cap is opt-in; manage mode has no invented max", () => {
  const seed = [
    { id: "h2h", selected: true },
    { id: "bts", selected: true },
    { id: "aespa", selected: true },
    { id: "njs", selected: false },
  ];
  assert.equal(followPicker.canComplete(seed.slice(0, 2), { minCount: 1, maxCount: 3 }), true);
  const blocked = followPicker.toggleGroup(seed, "njs", { maxCount: 3 });
  assert.equal(blocked.blocked, true);
  assert.equal(followPicker.selectedIds(blocked.groups).length, 3);
  const unlimited = followPicker.toggleGroup(seed, "njs", { maxCount: 0 });
  assert.equal(unlimited.blocked, false);
  assert.equal(followPicker.selectedIds(unlimited.groups).length, 4);
});

test("ME05 summary label and first 3–5 avatar strip", () => {
  const many = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: "g" + n,
    nameZh: "团" + n,
    logoColor: "#111",
  }));
  const summary = followPicker.followSummary(many, 5);
  assert.equal(summary.count, 6);
  assert.equal(summary.label, "已关注 6 个团体");
  assert.equal(summary.preview.length, 5);
  assert.equal(summary.preview[0].initial, "团");
});

test("ME06 privacy selected class is only on current value", () => {
  assert.equal(followPicker.privacyOptionClass("private", "private"), "on");
  assert.equal(followPicker.privacyOptionClass("private", "public"), "");
  assert.equal(followPicker.privacyOptionClass("public", "public"), "on");
});
