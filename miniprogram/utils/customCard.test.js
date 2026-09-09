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

test("UX06/UX07 fullscreen entry: pending ok, rejected not 收藏大图", () => {
  assert.equal(customCard.canOpenFullscreen("pending"), true);
  assert.equal(customCard.canOpenFullscreen("approved"), true);
  assert.equal(customCard.canOpenFullscreen("rejected"), false);
});

test("UX05 switch group clears member not in the new list", () => {
  const a = "member-a";
  assert.equal(customCard.nextMemberIdOnGroupChange(a, [{ id: "member-a" }]), a);
  assert.equal(customCard.nextMemberIdOnGroupChange(a, [{ id: "member-b" }]), "");
  assert.equal(customCard.nextMemberIdOnGroupChange(a, []), "");
});

test("mapCatalogMember accepts camelCase or snake_case", () => {
  const m = customCard.mapCatalogMember({
    id: "x",
    group_id: "g",
    name_en: "RM",
    name_zh: "RM",
    color: "#7c6cf0",
  });
  assert.equal(m.nameEn, "RM");
  assert.equal(m.groupId, "g");
});
