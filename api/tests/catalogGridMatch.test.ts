/**
 * UGC-2b-Match16 确认后匹配规则（无 DB）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridSubmissionRules } from "../src/gridSubmissionRules.js";

test("grid_page matches published and skips version + UGC points", () => {
  const grid = gridSubmissionRules("grid_page");
  assert.equal(grid.matchOwn, true);
  assert.equal(grid.versionRequired, false);
  assert.equal(grid.awardPointsOnOwn, false);

  const flagged = gridSubmissionRules("direct_submit", true);
  assert.equal(flagged.matchOwn, true);
  assert.equal(flagged.versionRequired, true);
  assert.equal(flagged.awardPointsOnOwn, false);

  const plain = gridSubmissionRules("direct_submit");
  assert.equal(plain.matchOwn, false);
  assert.equal(plain.versionRequired, true);
});
