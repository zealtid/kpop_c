import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENEFIT_MATRIX_INCOMPLETE_COPY,
  BENEFIT_MATRIX_READY_COPY,
  buildBenefitMatrix,
  buildCompleteness,
  resolveReleaseVersions,
  type BuildBenefitMatrixInput,
  type MatrixTemplate,
} from "../src/benefitMatrixBuild.js";
import { parseChannelDictionary } from "../src/channelDictionary.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const dict = parseChannelDictionary({
  channels: [
    { code: "weverse", name_zh: "Weverse Shop", aliases: ["WV"] },
    { code: "yes24", name_zh: "Yes24", aliases: [] },
  ],
});

const RELEASE = {
  id: "rel-1",
  groupId: "g-bts",
  title: "ARIRANG",
  titleZh: "ARIRANG",
  releasedOn: "2026-03-20",
  kind: "album",
  groupSlug: "bts",
  groupNameZh: "防弹少年团",
};

function publishedTpl(over: Partial<MatrixTemplate> = {}): MatrixTemplate {
  return {
    id: "tpl-pub",
    groupId: "g-bts",
    releaseId: "rel-1",
    name: "预购特典 Weverse",
    slotLabel: "",
    versionLabel: "Standard",
    memberId: null,
    status: "published",
    isDeprecated: false,
    mainImageUrl: "/media/cards/real-weverse.png",
    ...over,
  };
}

function input(over: Partial<BuildBenefitMatrixInput> = {}): BuildBenefitMatrixInput {
  return {
    release: RELEASE,
    versions: ["Standard", "特典-Weverse"],
    maps: [],
    templates: [],
    dict,
    ...over,
  };
}

test("empty confirmed → empty=true, versions fallback, incomplete copy, never 已凑齐", () => {
  const emptyVersions = buildBenefitMatrix(input({ versions: [] }));
  assert.deepEqual(emptyVersions.versions, ["standard"]);
  assert.equal(emptyVersions.empty, true);
  assert.equal(emptyVersions.rows.length, 0);
  assert.equal(emptyVersions.completeness.ready, false);
  assert.equal(emptyVersions.completeness.ratio, 0);
  assert.equal(emptyVersions.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
  assert.notEqual(emptyVersions.completeness.copy, BENEFIT_MATRIX_READY_COPY);
  assert.doesNotMatch(emptyVersions.completeness.copy, /已凑齐全部特典/);

  const withVersions = buildBenefitMatrix(input());
  assert.deepEqual(withVersions.versions, ["Standard", "特典-Weverse"]);
  assert.equal(withVersions.empty, true);
  assert.doesNotMatch(withVersions.completeness.copy, /已凑齐全部特典/);
});

test("drafting / retired maps are dropped; only confirmed rows appear", () => {
  const matrix = buildBenefitMatrix(
    input({
      maps: [
        {
          id: "m-draft",
          versionLabel: "standard",
          channelCode: "weverse",
          benefitNameZh: "起草中",
          mapsToSlotLabels: "预购特典 Weverse",
          mapMode: "slots",
          status: "drafting",
          benefitBatch: "1.0",
          versionLabelForTemplate: null,
        },
        {
          id: "m-ret",
          versionLabel: "standard",
          channelCode: "weverse",
          benefitNameZh: "已退役",
          mapsToSlotLabels: "预购特典 Weverse",
          mapMode: "slots",
          status: "retired",
          benefitBatch: null,
          versionLabelForTemplate: null,
        },
      ],
      templates: [publishedTpl()],
    }),
  );
  assert.equal(matrix.empty, true);
  assert.equal(matrix.rows.length, 0);
});

test("published slot is navigable and may carry a real image", () => {
  const matrix = buildBenefitMatrix(
    input({
      maps: [
        {
          id: "m-ok",
          versionLabel: "standard",
          channelCode: "weverse",
          benefitNameZh: "预购特典 Weverse",
          mapsToSlotLabels: "预购特典 Weverse",
          mapMode: "slots",
          status: "confirmed",
          benefitBatch: "1.0",
          versionLabelForTemplate: null,
        },
      ],
      templates: [publishedTpl()],
    }),
  );
  assert.equal(matrix.empty, false);
  assert.equal(matrix.rows.length, 1);
  assert.equal(matrix.rows[0].channelNameZh, "Weverse Shop");
  assert.equal(matrix.rows[0].benefitBatch, "1.0");
  assert.equal(matrix.rows[0].mapMode, "slots");
  const slot = matrix.rows[0].slots[0];
  assert.equal(slot.templateStatus, "published");
  assert.equal(slot.navigable, true);
  assert.equal(slot.templateId, "tpl-pub");
  assert.equal(slot.imageUrl, "/media/cards/real-weverse.png");
  assert.equal(slot.version, "standard");
  assert.equal(matrix.completeness.ready, true);
  assert.equal(matrix.completeness.ratio, 1);
  assert.equal(matrix.completeness.copy, BENEFIT_MATRIX_READY_COPY);
});

test("draft / missing slots are 待补: not navigable and no fake image", () => {
  const matrix = buildBenefitMatrix(
    input({
      maps: [
        {
          id: "m-mix",
          versionLabel: "standard",
          channelCode: "weverse",
          benefitNameZh: "混合特典",
          mapsToSlotLabels: "预购特典 Weverse;不存在的卡槽",
          mapMode: "slots",
          status: "confirmed",
          benefitBatch: null,
          versionLabelForTemplate: "Standard",
        },
      ],
      templates: [
        publishedTpl({
          id: "tpl-draft",
          status: "draft",
          mainImageUrl: "/media/cards/should-not-leak.png",
        }),
      ],
    }),
  );
  assert.equal(matrix.rows[0].slots.length, 2);
  const draft = matrix.rows[0].slots[0];
  const missing = matrix.rows[0].slots[1];
  assert.equal(draft.templateStatus, "draft");
  assert.equal(draft.navigable, false);
  assert.equal(draft.imageUrl, null);
  assert.equal(missing.templateStatus, "missing");
  assert.equal(missing.navigable, false);
  assert.equal(missing.templateId, null);
  assert.equal(missing.imageUrl, null);
  assert.equal(matrix.completeness.ready, false);
  assert.equal(matrix.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
  assert.doesNotMatch(matrix.completeness.copy, /已凑齐全部特典/);
  const dumped = JSON.stringify(matrix);
  assert.doesNotMatch(dumped, /should-not-leak/);
  assert.doesNotMatch(dumped, /placeholder|fake-card|dummy\.png/i);
});

test("slot_label wins over name; version_label_for_template is used", () => {
  const matrix = buildBenefitMatrix(
    input({
      maps: [
        {
          id: "m-label",
          versionLabel: "standard",
          channelCode: "weverse",
          benefitNameZh: "卡槽特典",
          mapsToSlotLabels: "卡槽A",
          mapMode: "slots",
          status: "confirmed",
          benefitBatch: null,
          versionLabelForTemplate: "特典-Weverse",
        },
      ],
      templates: [
        publishedTpl({
          id: "tpl-label",
          name: "别名不要匹配",
          slotLabel: "卡槽A",
          versionLabel: "特典-Weverse",
          mainImageUrl: "/media/cards/slot-a.png",
        }),
        publishedTpl({
          id: "tpl-name-trap",
          name: "卡槽A",
          slotLabel: "其他",
          versionLabel: "特典-Weverse",
        }),
      ],
    }),
  );
  assert.equal(matrix.rows[0].slots.length, 1);
  assert.equal(matrix.rows[0].slots[0].templateId, "tpl-label");
  assert.equal(matrix.rows[0].slots[0].version, "特典-Weverse");
});

test("benefit_only confirmed has no slots and does not claim 已凑齐", () => {
  const matrix = buildBenefitMatrix(
    input({
      maps: [
        {
          id: "m-only",
          versionLabel: "standard",
          channelCode: "yes24",
          benefitNameZh: "未拆卡 Yes24",
          mapsToSlotLabels: "应被忽略",
          mapMode: "benefit_only",
          status: "confirmed",
          benefitBatch: "2.0",
          versionLabelForTemplate: null,
        },
      ],
    }),
  );
  assert.equal(matrix.empty, false);
  assert.equal(matrix.rows[0].channelNameZh, "Yes24");
  assert.deepEqual(matrix.rows[0].slots, []);
  assert.equal(matrix.completeness.ready, false);
  assert.equal(matrix.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
});

test("resolveReleaseVersions de-dupes and defaults to standard", () => {
  assert.deepEqual(resolveReleaseVersions([]), ["standard"]);
  assert.deepEqual(resolveReleaseVersions(["Standard", "standard", "特典-JP"]), ["Standard", "特典-JP"]);
});

test("buildCompleteness never uses 已凑齐 copy when not ready", () => {
  const pending = buildCompleteness(
    [{ label: "x", version: "standard", templateId: null, templateName: null, templateStatus: "missing", navigable: false, imageUrl: null }],
    false,
  );
  assert.equal(pending.ready, false);
  assert.equal(pending.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
  assert.doesNotMatch(pending.copy, /已凑齐全部特典/);
});

test("knife B seed fixture is a structural sample (prod names must be aligned)", () => {
  const csv = readFileSync(path.resolve(here, "../fixtures/version-benefit-b-seed-arirang-confirmed.csv"), "utf8");
  assert.match(csv, /group_id,release_id,version_label/);
  assert.match(csv, /confirmed/);
  assert.match(csv, /drafting/);
  assert.match(csv, /benefit_only/);
  assert.match(csv, /maps_to_slot_labels/);
});
