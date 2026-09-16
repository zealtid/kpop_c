/**
 * 收藏列表封面解析：禁止团图标当封面。
 * run: node --test miniprogram/utils/groupCover.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const groupCover = require("./groupCover");

function mediaUrl(u) {
  return u ? `https://cdn.test${u}` : "";
}

test("unset cover with no owned image is placeholder, never group icon", () => {
  const visual = groupCover.resolveListVisual(
    {
      nameZh: "防弹少年团",
      iconUrl: "/media/groups/bts.png",
      logoUrl: "/media/groups/bts-logo.png",
      logoColor: "#6B5CFF",
      cover: { templateId: null, mainImageUrl: null, source: "none" },
    },
    mediaUrl,
  );
  assert.equal(visual.hasCover, false);
  assert.equal(visual.coverSrc, "");
  assert.equal(visual.coverSource, "none");
  assert.equal(visual.logoSrc, "https://cdn.test/media/groups/bts.png");
  assert.equal(visual.initial, "防");
});

test("user-set cover uses template main image, not logo", () => {
  const visual = groupCover.resolveListVisual(
    {
      nameZh: "H2H",
      iconUrl: "/media/groups/h2h.png",
      cover: { templateId: "t1", mainImageUrl: "/media/cards/yeon.jpg", source: "user" },
    },
    mediaUrl,
  );
  assert.equal(visual.hasCover, true);
  assert.equal(visual.coverSrc, "https://cdn.test/media/cards/yeon.jpg");
  assert.equal(visual.coverSource, "user");
  assert.notEqual(visual.coverSrc, visual.logoSrc);
});

test("latest owned fallback still not logo", () => {
  const g = groupCover.decorateFollowedGroup(
    {
      nameEn: "BTS",
      iconUrl: "/icon.png",
      progress: { ownedDistinct: 2, publishedCount: 21 },
      cover: { templateId: "t2", mainImageUrl: "/media/cards/latest.jpg", source: "latest" },
    },
    mediaUrl,
  );
  assert.equal(g.pct, 10);
  assert.equal(g.coverSrc, "https://cdn.test/media/cards/latest.jpg");
  assert.equal(g.coverSource, "latest");
  assert.ok(!g.coverSrc.includes("icon"));
});
