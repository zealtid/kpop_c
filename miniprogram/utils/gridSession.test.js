/**
 * UGC-2b 宫格会话与 UGC-1 降级
 * run: node --test miniprogram/utils/gridSession.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const gridSession = require("./gridSession");

test("begin / activeCards / degradeToUgc1", () => {
  gridSession.begin({
    src: "tmp://page.jpg",
    origW: 100,
    origH: 150,
    boxes: [
      { x: 0, y: 0, w: 0.5, h: 0.5, memberName: "Carmen" },
      { x: 0.5, y: 0, w: 0.5, h: 0.5, deleted: true },
    ],
    library: "doubao",
    engine: "vlm",
    suggestedVersionLabel: "POB",
  });
  assert.equal(gridSession.activeCards().length, 1);
  assert.equal(gridSession.get().suggestedVersionLabel, "POB");
  assert.equal(gridSession.get().boxes[0].suggestedMemberName, "Carmen");
  assert.equal(gridSession.MAX_SUBMIT, 9);
  const id = gridSession.matchMemberId("carmen", [{ id: "m1", nameEn: "Carmen", nameZh: "卡门" }]);
  assert.equal(id, "m1");
  const store = {};
  const nav = [];
  const wxLike = {
    setStorageSync(k, v) {
      store[k] = v;
    },
    redirectTo(opts) {
      nav.push(opts.url);
    },
  };
  gridSession.degradeToUgc1(wxLike, "tmp://page.jpg", { groupId: "g1" });
  assert.equal(store.ugc_submit_prefill.frontPath, "tmp://page.jpg");
  assert.equal(store.ugc_submit_prefill.groupId, "g1");
  assert.equal(nav[0], "/pages/catalog-submit/index");
  gridSession.cancel();
});
