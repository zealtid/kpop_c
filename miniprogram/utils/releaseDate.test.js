/**
 * ME08–ME09 图鉴发行日（Asia/Shanghai 日历日）
 * run: node --test miniprogram/utils/releaseDate.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const releaseDate = require("./releaseDate");

test("ME08 date-only YYYY-MM-DD is used as calendar date", () => {
  assert.equal(releaseDate.formatReleasedOn("2025-02-24"), "2025-02-24");
  assert.equal(releaseDate.formatReleasedOn("2026-03-20"), "2026-03-20");
  assert.equal(releaseDate.DISPLAY_TZ, "Asia/Shanghai");
});

test("ME08 ISO UTC midnight of the date stays the same Shanghai day", () => {
  assert.equal(releaseDate.formatReleasedOn("2025-02-24T00:00:00.000Z"), "2025-02-24");
  assert.equal(releaseDate.formatReleasedOn(new Date("2025-02-24T00:00:00.000Z")), "2025-02-24");
});

test("ME08 Shanghai midnight serialized as previous-day 16:00Z does not off-by-one", () => {
  assert.equal(releaseDate.formatReleasedOn("2025-02-23T16:00:00.000Z"), "2025-02-24");
  assert.equal(releaseDate.formatReleasedOn(new Date("2025-02-23T16:00:00.000Z")), "2025-02-24");
});

test("ME08 naive midnight without TZ is not parsed as UTC", () => {
  assert.equal(releaseDate.formatReleasedOn("2025-02-24T00:00:00"), "2025-02-24");
  assert.equal(releaseDate.formatReleasedOn("2025-02-24 00:00:00"), "2025-02-24");
  assert.equal(releaseDate.formatReleasedOn("2025-02-24T00:00:00.000"), "2025-02-24");
});

test("ME09 missing / invalid never throws and shows —", () => {
  assert.equal(releaseDate.formatReleasedOn(null), "—");
  assert.equal(releaseDate.formatReleasedOn(undefined), "—");
  assert.equal(releaseDate.formatReleasedOn(""), "—");
  assert.equal(releaseDate.formatReleasedOn("   "), "—");
  assert.equal(releaseDate.formatReleasedOn("Invalid Date"), "—");
  assert.equal(releaseDate.formatReleasedOn("not-a-date"), "—");
  assert.equal(releaseDate.formatReleasedOn({}), "—");
  assert.doesNotThrow(() => releaseDate.formatReleasedOn(undefined));
});

test("ME08/ME09 decorateRelease reads released_on or releasedOn", () => {
  assert.equal(releaseDate.decorateRelease({ released_on: "2025-02-23T16:00:00.000Z" }).releasedOnLabel, "2025-02-24");
  assert.equal(releaseDate.decorateRelease({ releasedOn: "2026-03-20" }).releasedOnLabel, "2026-03-20");
  assert.equal(releaseDate.decorateRelease({ releasedOn: null, kind: "album" }).releasedOnLabel, "—");
  assert.equal(releaseDate.decorateRelease(null).releasedOnLabel, "—");
});
