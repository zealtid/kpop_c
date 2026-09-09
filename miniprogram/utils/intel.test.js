/**
 * M2-b intel helpers
 * run: node --test miniprogram/utils/intel.test.js
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toasts = [];
const clips = [];
const opens = [];

global.wx = {
  showToast(opts) {
    toasts.push(opts);
  },
  setClipboardData(opts) {
    clips.push(opts.data);
    if (opts.success) opts.success();
  },
  openUrl(opts) {
    opens.push(opts.url);
  },
};

const intel = require("./intel");

beforeEach(() => {
  toasts.length = 0;
  clips.length = 0;
  opens.length = 0;
});

test("shanghaiClock prefers startAtShanghai +08:00 and UTC fallback is Asia/Shanghai", () => {
  assert.equal(intel.shanghaiClock("2026-09-09T18:00:00+08:00"), "09-09 18:00");
  assert.equal(intel.shanghaiDateKey("2026-09-09T18:00:00+08:00"), "2026-09-09");
  assert.equal(intel.shanghaiClock(null, "2026-09-09T10:00:00.000Z"), "09-09 18:00");
  assert.equal(intel.DISPLAY_TZ, "Asia/Shanghai");
});

test("ticket_sale countdown is live then 已开售", () => {
  const start = "2026-09-09T18:00:00+08:00";
  const hourLeft = intel.ticketCountdown(start, Date.parse("2026-09-09T17:00:00+08:00"));
  assert.equal(hourLeft.live, true);
  assert.equal(hourLeft.overdue, false);
  assert.equal(hourLeft.text, "1小时00分");
  const done = intel.ticketCountdown(start, Date.parse("2026-09-09T19:00:00+08:00"));
  assert.equal(done.text, "已开售");
  assert.equal(done.overdue, true);
  assert.equal(done.live, false);
});

test("F02 client filter drops L3 and hidden", () => {
  const items = [
    { id: "l1", status: "published", trustLevel: "L1" },
    { id: "l2", status: "published", trustLevel: "L2" },
    { id: "l3", status: "published", trustLevel: "L3" },
    { id: "hid", status: "hidden", trustLevel: "L1" },
  ];
  const vis = intel.visibleFeeds(items).map((x) => x.id);
  assert.deepEqual(vis, ["l1", "l2"]);
  assert.equal(intel.isScheduleVisible({ status: "published", trustLevel: "L3" }), false);
});

test("follow chips and group filter", () => {
  const chips = intel.followChips(
    [
      { id: "g1", nameZh: "H2H" },
      { id: "g2", nameZh: "BTS" },
    ],
    "g2",
  );
  assert.equal(chips[0].name, "全部");
  assert.equal(chips[0].on, false);
  assert.equal(chips[2].on, true);
  const feeds = [
    { id: "a", groupIds: ["g1"] },
    { id: "b", groupIds: ["g2"], groups: [{ id: "g2" }] },
  ];
  assert.equal(intel.filterByGroup(feeds, "").length, 2);
  assert.deepEqual(
    intel.filterByGroup(feeds, "g2").map((x) => x.id),
    ["b"],
  );
});

test("decorateFeed exposes source, trust, machine-translate mark, outbound", () => {
  const card = intel.decorateFeed({
    title: "预告",
    summary: "摘要",
    trustLevel: "L1",
    category: "official",
    isMachineTranslated: true,
    sourceNote: "Weverse 官方",
    canonicalUrl: "https://weverse.io/x",
    groups: [{ nameZh: "H2H" }],
    publishedAt: "2026-09-09T10:00:00.000Z",
  });
  assert.equal(card.sourceBadge, "Weverse 官方");
  assert.equal(card.trustLabel, "L1");
  assert.equal(card.translatedMark, "机翻");
  assert.equal(card.outboundUrl, "https://weverse.io/x");
  assert.equal(card.groupLabel, "H2H");
});

test("decorateSchedule ticket_sale gets red countdown fields", () => {
  const ev = intel.decorateSchedule(
    {
      title: "门票开售",
      kind: "ticket_sale",
      startAtShanghai: "2026-09-09T18:00:00+08:00",
      group: { nameZh: "BTS" },
      trustLevel: "L1",
      sourceUrl: "https://weverse.io/bts",
    },
    Date.parse("2026-09-09T10:00:00+08:00"),
  );
  assert.equal(ev.isTicketSale, true);
  assert.equal(ev.kindLabel, "门票开售");
  assert.equal(ev.countdownLive, true);
  assert.equal(ev.startLabel, "09-09 18:00");
  assert.equal(ev.timezone, "Asia/Shanghai");
});

test("copyOutbound and openOutbound do not use web-view", () => {
  const src = fs.readFileSync(path.join(__dirname, "intel.js"), "utf8");
  assert.doesNotMatch(src, /<web-view|createWebView|wx\.navigateToMiniProgram/);
  intel.copyOutbound("https://ibighit.com/bts");
  assert.deepEqual(clips, ["https://ibighit.com/bts"]);
  intel.openOutbound("https://weverse.io/h2h");
  assert.deepEqual(opens, ["https://weverse.io/h2h"]);
  intel.copyOutbound("");
  assert.equal(toasts.some((t) => t.title === "暂无原文链接"), true);
});

test("groupEventsByDate buckets by Shanghai date", () => {
  const sections = intel.groupEventsByDate([
    { id: "1", startAtShanghai: "2026-09-09T10:00:00+08:00", dateKey: "2026-09-09" },
    { id: "2", startAtShanghai: "2026-09-10T10:00:00+08:00", dateKey: "2026-09-10" },
    { id: "3", startAtShanghai: "2026-09-09T21:00:00+08:00", dateKey: "2026-09-09" },
  ]);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[1].date, "2026-09-10");
});
