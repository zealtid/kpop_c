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
  assert.ok(hits.every((h) => h.key));
  const wv = pick.filterOptions(channels, "wv");
  assert.ok(wv.some((h) => h.value === "weverse"));
  const none = pick.filterOptions(channels, "没有这个特典xyz");
  assert.ok(none.some((h) => h.value === pick.OTHER_VALUE));
  const capped = pick.filterOptions(channels, "", 1);
  assert.equal(capped.filter((h) => h.kind === "other").length, 1);
});

test("displayLabel prefers handwritten 其他/手填 text", () => {
  assert.equal(pick.displayLabel("weverse", "Weverse Shop", "", false), "Weverse Shop");
  assert.equal(pick.displayLabel(pick.OTHER_VALUE, pick.OTHER_LABEL, "店庆特典", true), "店庆特典");
  assert.equal(pick.benefitsQuery("g1", ""), "/catalog/benefits?groupId=g1");
});

test("OQ-A other stores handwritten text", () => {
  assert.equal(pick.resolveChannelCode("weverse", "ignored"), "weverse");
  assert.equal(pick.resolveChannelCode(pick.OTHER_VALUE, " 店庆特典 "), "店庆特典");
  assert.equal(pick.resolveChannelCode(pick.OTHER_VALUE, "  "), null);
});
