/**
 * 刀 B 发行页特典矩阵纯函数。
 * run: node --test miniprogram/utils/benefitMatrix.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const m = require("./benefitMatrix");

test("empty / incomplete footnote never says 已凑齐全部特典", () => {
  assert.equal(m.footnote({ ready: false, ratio: 0, copy: m.INCOMPLETE_COPY }), m.INCOMPLETE_COPY);
  assert.equal(m.footnote({ ready: false, ratio: 0, copy: m.READY_COPY }), m.INCOMPLETE_COPY);
  assert.equal(m.footnote(null), m.INCOMPLETE_COPY);
  assert.equal(m.footnote({ ready: true, ratio: 1, copy: m.READY_COPY }), m.READY_COPY);
});

test("initialVersion prefers a bucket that has rows, else first / standard", () => {
  assert.equal(m.initialVersion(["Standard", "特典-JP"], []), "Standard");
  assert.equal(
    m.initialVersion(
      ["Standard", "特典-JP"],
      [{ versionLabel: "特典-JP", slots: [] }],
    ),
    "特典-JP",
  );
  assert.equal(m.initialVersion([], []), "standard");
});

test("decorateSlot: published keeps real image; draft/missing 禁假图", () => {
  const pub = m.decorateSlot(
    {
      label: "预购特典 Weverse",
      templateStatus: "published",
      navigable: true,
      imageUrl: "/media/cards/real.png",
      templateName: "预购特典 Weverse",
    },
    (url) => "https://cdn" + url,
  );
  assert.equal(pub.navigable, true);
  assert.equal(pub.pending, false);
  assert.equal(pub.imageUrl, "https://cdn/media/cards/real.png");
  assert.equal(m.hasFakeImage(pub), false);

  const draft = m.decorateSlot(
    {
      label: "草稿槽",
      templateStatus: "draft",
      navigable: false,
      imageUrl: "/media/cards/should-not-show.png",
    },
    (url) => "https://cdn" + url,
  );
  assert.equal(draft.navigable, false);
  assert.equal(draft.pending, true);
  assert.equal(draft.imageUrl, "");
  assert.equal(draft.pendingLabel, "图鉴待补");
  assert.equal(m.hasFakeImage(draft), false);

  const missing = m.decorateSlot({ label: "无卡", templateStatus: "missing", navigable: false }, null);
  assert.equal(missing.imageUrl, "");
  assert.equal(missing.pending, true);
});

test("rowsForVersion is case-insensitive on standard / Standard", () => {
  const rows = [
    { versionLabel: "standard", benefitNameZh: "A" },
    { versionLabel: "特典-JP", benefitNameZh: "B" },
  ];
  assert.equal(m.rowsForVersion(rows, "Standard").length, 1);
  assert.equal(m.rowsForVersion(rows, "特典-JP")[0].benefitNameZh, "B");
});
