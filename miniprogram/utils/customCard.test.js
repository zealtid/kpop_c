const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const modals = [];
const toasts = [];

global.wx = {
  showModal(opts) {
    modals.push(opts);
  },
  showToast(opts) {
    toasts.push(opts);
  },
};

const customCard = require("./customCard");

beforeEach(() => {
  modals.length = 0;
  toasts.length = 0;
});

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

test("confirmDeleteCustomCard: cancel does not call DELETE", async () => {
  let called = 0;
  const p = customCard.confirmDeleteCustomCard("card-1", () => {
    called += 1;
    return Promise.resolve({ deleted: true });
  });
  assert.equal(modals.length, 1);
  assert.equal(modals[0].title, "删除自定义卡");
  modals[0].success({ confirm: false });
  const result = await p;
  assert.equal(result.cancelled, true);
  assert.equal(called, 0);
  assert.equal(toasts.length, 0);
});

test("confirmDeleteCustomCard: confirm DELETEs owner card and toasts", async () => {
  const calls = [];
  const p = customCard.confirmDeleteCustomCard("card-2", (opts) => {
    calls.push(opts);
    return Promise.resolve({ deleted: true });
  });
  modals[0].success({ confirm: true });
  const result = await p;
  assert.equal(result.cancelled, false);
  assert.equal(result.data.deleted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/collection/custom-cards/card-2");
  assert.equal(calls[0].method, "DELETE");
  assert.equal(toasts[0].title, "已删除");
});

test("confirmDeleteCustomCard: missing id rejects without modal", async () => {
  await assert.rejects(() => customCard.confirmDeleteCustomCard("", () => Promise.resolve({})), {
    status: 400,
  });
  assert.equal(modals.length, 0);
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
