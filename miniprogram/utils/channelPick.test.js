/**
 * run: node --test miniprogram/utils/channelPick.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const pick = require("./channelPick");

const channels = pick.mapChannels([
  { code: "weverse", nameZh: "Weverse Shop", aliases: ["WV"] },
  { code: "yes24", name_zh: "Yes24", aliases: [] },
]);

test("maps dictionary and benefit-matrix rows", () => {
  assert.equal(channels[0].label, "Weverse Shop");
  const benefits = pick.mapBenefitRows([
    { channelCode: "weverse", channelNameZh: "Weverse Shop", benefitNameZh: "预购特典" },
    { channelCode: "weverse", channelNameZh: "Weverse Shop", benefitNameZh: "预购特典" },
  ]);
  assert.equal(benefits.length, 1);
  assert.equal(benefits[0].label, "Weverse Shop · 预购特典");
});

test("searchable list always offers 其他/手填", () => {
  const hits = pick.filterOptions(channels, "");
  assert.ok(hits.some((h) => h.value === pick.OTHER_VALUE && h.label === "其他/手填"));
  const wv = pick.filterOptions(channels, "wv");
  assert.ok(wv.some((h) => h.value === "weverse"));
  const none = pick.filterOptions(channels, "没有这个通路xyz");
  assert.ok(none.some((h) => h.value === pick.OTHER_VALUE));
});

test("OQ-A other stores handwritten text", () => {
  assert.equal(pick.resolveChannelCode("weverse", "ignored"), "weverse");
  assert.equal(pick.resolveChannelCode(pick.OTHER_VALUE, " 店庆特典 "), "店庆特典");
  assert.equal(pick.resolveChannelCode(pick.OTHER_VALUE, "  "), null);
});
