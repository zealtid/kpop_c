import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadChannelDictionary, normalizeChannelCode, parseChannelDictionary } from "../src/channelDictionary.js";
import { emptyBenefitRow, parseBenefitCsv, splitSlotLabels } from "../src/versionBenefitParse.js";
import {
  findGroup,
  findRelease,
  validateBenefitRow,
  type CatalogSnapshot,
} from "../src/versionBenefitValidate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dict = loadChannelDictionary();

const GROUP = { id: "g-bts", slug: "bts" };
const RELEASE = {
  id: "r-arirang",
  groupId: "g-bts",
  title: "ARIRANG",
  titleZh: "阿里郎",
  aliases: "阿里郎",
  versions: ["Standard", "特典-Weverse"],
  allowsStandard: true,
};
const MEMBER_RM = { id: "m-rm", groupId: "g-bts", nameEn: "RM", nameZh: "RM" };
const MEMBER_JIN = { id: "m-jin", groupId: "g-bts", nameEn: "Jin", nameZh: "진" };

const SLOT_TPL = {
  id: "t1",
  groupId: "g-bts",
  releaseId: "r-arirang",
  slotLabel: "预购特典 Weverse",
  versionLabel: "Standard",
  memberId: null as string | null,
};

function catalog(over: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    groups: [GROUP],
    releases: [RELEASE],
    members: [MEMBER_RM, MEMBER_JIN],
    templates: [SLOT_TPL],
    tagsStrict: false,
    ...over,
  };
}

function row(over: Partial<ReturnType<typeof emptyBenefitRow>> = {}) {
  return {
    ...emptyBenefitRow(2),
    group_id: "bts",
    release_id: "bts-arirang",
    version_label: "standard",
    channel_code: "weverse",
    benefit_name_zh: "预购特典 Weverse",
    maps_to_slot_labels: "预购特典 Weverse",
    map_mode: "slots",
    evidence_url: "https://example.invalid/weverse-arirang-pob",
    status: "confirmed",
    ...over,
  };
}

function codes(issues: { code: string }[]) {
  return issues.map((i) => i.code);
}

test("channel dictionary loads and aliases fold case-insensitively", () => {
  assert.ok(dict.channels.some((c) => c.code === "weverse"));
  assert.equal(normalizeChannelCode("Weverse", dict), "weverse");
  assert.equal(normalizeChannelCode("wv", dict), "weverse");
  assert.equal(normalizeChannelCode("薇谱", dict), "weverse");
  assert.equal(normalizeChannelCode("天猫", dict), "tmall-flagship");
  assert.equal(normalizeChannelCode("YES24", dict), "yes24");
  assert.equal(normalizeChannelCode("not-a-channel", dict), null);
  const copy = parseChannelDictionary(JSON.parse(readFileSync(path.resolve(here, "../fixtures/channel_dictionary.json"), "utf8")));
  assert.equal(copy.channels.length, dict.channels.length);
});

test("sample CSV parses; slot split trims but does not invent spaces", () => {
  const text = readFileSync(path.resolve(here, "../fixtures/version_benefit_map.sample.csv"), "utf8");
  const parsed = parseBenefitCsv(text);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].group_id, "bts");
  assert.equal(parsed.rows[0].release_id, "bts-arirang");
  assert.deepEqual(splitSlotLabels("预购特典 Weverse;预购特典 天猫\n第二槽"), [
    "预购特典 Weverse",
    "预购特典 天猫",
    "第二槽",
  ]);
  assert.deepEqual(splitSlotLabels("预购特典Weverse"), ["预购特典Weverse"]);
});

test("release slug bts-arirang resolves from title (not UUID)", () => {
  const snap = catalog();
  assert.ok(findGroup(snap.groups, "bts"));
  assert.ok(findGroup(snap.groups, "g-bts"));
  const hit = findRelease(snap, GROUP, "bts-arirang");
  assert.equal(hit.release?.id, "r-arirang");
  assert.equal(findRelease(snap, GROUP, "ARIRANG").release?.id, "r-arirang");
});

test("VB01 passing confirmed slots row", () => {
  const result = validateBenefitRow(row(), { dict, catalog: catalog() });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.channelCode, "weverse");
  assert.equal(result.release?.id, "r-arirang");
});

test("alias Weverse / WV normalize on a passing row", () => {
  const a = validateBenefitRow(row({ channel_code: "WV" }), { dict, catalog: catalog() });
  const b = validateBenefitRow(row({ channel_code: "Weverse" }), { dict, catalog: catalog() });
  assert.equal(a.ok, true, JSON.stringify(a.issues));
  assert.equal(b.ok, true);
  assert.equal(a.channelCode, "weverse");
  assert.equal(b.channelCode, "weverse");
});

test("E_GROUP when confirmed group missing", () => {
  const result = validateBenefitRow(row({ group_id: "stray-kids", release_id: "skz-this-and-that" }), {
    dict,
    catalog: catalog(),
  });
  assert.ok(codes(result.issues).includes("E_GROUP"));
});

test("E_RELEASE when release missing or not in group", () => {
  const miss = validateBenefitRow(row({ release_id: "bts-missing" }), { dict, catalog: catalog() });
  assert.ok(codes(miss.issues).includes("E_RELEASE"));
  const other = catalog({
    groups: [GROUP, { id: "g-skz", slug: "stray-kids" }],
    releases: [RELEASE, { ...RELEASE, id: "r-skz", groupId: "g-skz", title: "This And That", versions: ["Standard"] }],
  });
  const cross = validateBenefitRow(row({ group_id: "bts", release_id: "r-skz" }), { dict, catalog: other });
  assert.ok(codes(cross.issues).includes("E_RELEASE"));
});

test("E_VERSION when version_label not on release", () => {
  const result = validateBenefitRow(row({ version_label: "photobook-z" }), { dict, catalog: catalog() });
  assert.ok(codes(result.issues).includes("E_VERSION"));
});

test("E_CHANNEL unknown-to-dict and unknown+confirmed", () => {
  const bad = validateBenefitRow(row({ channel_code: "not-real" }), { dict, catalog: catalog() });
  assert.ok(codes(bad.issues).includes("E_CHANNEL"));
  const unknown = validateBenefitRow(row({ channel_code: "unknown" }), { dict, catalog: catalog() });
  assert.ok(codes(unknown.issues).includes("E_CHANNEL"));
  const draftUnknown = validateBenefitRow(row({ channel_code: "unknown", status: "drafting" }), {
    dict,
    catalog: catalog(),
  });
  assert.equal(draftUnknown.ok, true, JSON.stringify(draftUnknown.issues));
  assert.equal(draftUnknown.channelCode, "unknown");
});

test("E_EVIDENCE when confirmed evidence missing or not http(s)", () => {
  const empty = validateBenefitRow(row({ evidence_url: "" }), { dict, catalog: catalog() });
  const ftp = validateBenefitRow(row({ evidence_url: "ftp://example.invalid/x" }), { dict, catalog: catalog() });
  assert.ok(codes(empty.issues).includes("E_EVIDENCE"));
  assert.ok(codes(ftp.issues).includes("E_EVIDENCE"));
});

test("E_SLOT_EMPTY / E_SLOT_MISS / no auto space fix", () => {
  const empty = validateBenefitRow(row({ maps_to_slot_labels: "  ;  \n" }), { dict, catalog: catalog() });
  assert.ok(codes(empty.issues).includes("E_SLOT_EMPTY"));
  const miss = validateBenefitRow(row({ maps_to_slot_labels: "预购特典 天猫" }), { dict, catalog: catalog() });
  assert.ok(codes(miss.issues).includes("E_SLOT_MISS"));
  const nospace = validateBenefitRow(row({ maps_to_slot_labels: "预购特典Weverse" }), { dict, catalog: catalog() });
  assert.ok(codes(nospace.issues).includes("E_SLOT_MISS"));
});

test("E_SLOT_AMBIG when specific member hits two templates", () => {
  const snap = catalog({
    templates: [
      { ...SLOT_TPL, id: "t-a", memberId: "m-rm" },
      { ...SLOT_TPL, id: "t-b", memberId: "m-rm" },
    ],
  });
  const result = validateBenefitRow(row({ member_scope: "RM" }), { dict, catalog: snap });
  assert.ok(codes(result.issues).includes("E_SLOT_AMBIG"));
});

test("E_MEMBER when member_scope does not match template.member_id", () => {
  const snap = catalog({
    templates: [{ ...SLOT_TPL, memberId: "m-jin" }],
  });
  const result = validateBenefitRow(row({ member_scope: "RM" }), { dict, catalog: snap });
  assert.ok(codes(result.issues).includes("E_MEMBER"));
  const unknownMember = validateBenefitRow(row({ member_scope: "nobody" }), { dict, catalog: catalog() });
  assert.ok(codes(unknownMember.issues).includes("E_MEMBER"));
});

test("all_random requires null member_id; group accepts any", () => {
  const withMember = catalog({ templates: [{ ...SLOT_TPL, memberId: "m-rm" }] });
  const randomFail = validateBenefitRow(row({ member_scope: "all_random" }), { dict, catalog: withMember });
  assert.ok(codes(randomFail.issues).includes("E_MEMBER"));
  const randomOk = validateBenefitRow(row({ member_scope: "all_random" }), { dict, catalog: catalog() });
  assert.equal(randomOk.ok, true, JSON.stringify(randomOk.issues));
  const groupOk = validateBenefitRow(row({ member_scope: "group" }), { dict, catalog: withMember });
  assert.equal(groupOk.ok, true, JSON.stringify(groupOk.issues));
});

test("benefit_only confirmed skips Template / slot checks", () => {
  const result = validateBenefitRow(
    row({ map_mode: "benefit_only", maps_to_slot_labels: "", benefit_name_zh: "未拆卡特典" }),
    { dict, catalog: catalog({ templates: [] }) },
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.ok(!codes(result.issues).includes("E_SLOT_EMPTY"));
  assert.ok(!codes(result.issues).includes("E_SLOT_MISS"));
});

test("drafting does not require catalog existence or evidence", () => {
  const result = validateBenefitRow(
    row({
      group_id: "stray-kids",
      release_id: "skz-this-and-that",
      channel_code: "K4",
      status: "drafting",
      evidence_url: "",
      maps_to_slot_labels: "预购特典 K4",
    }),
    { dict, catalog: catalog() },
  );
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.channelCode, "ktown4u");
});

test("tags_hint warns by default; tags_strict can block confirmed", () => {
  const warn = validateBenefitRow(row({ tags_hint: "特典，预购" }), { dict, catalog: catalog() });
  assert.equal(warn.ok, true);
  assert.ok(codes(warn.issues).includes("W_TAGS"));
  const strict = validateBenefitRow(row({ tags_hint: "" }), { dict, catalog: catalog({ tagsStrict: true }) });
  assert.ok(codes(strict.issues).includes("E_TAGS"));
});

test("CLI prints row errors and exits non-zero; drafting-only exits 0", () => {
  const apiRoot = path.resolve(here, "..");
  const tsx = path.resolve(apiRoot, "../node_modules/.bin/tsx");
  const script = path.resolve(apiRoot, "scripts/validate-version-benefit.ts");
  const sample = path.resolve(apiRoot, "fixtures/version_benefit_map.sample.csv");
  const fail = spawnSync(tsx, [script, "--no-db", sample], { encoding: "utf8", cwd: apiRoot });
  assert.notEqual(fail.status, 0);
  assert.match(fail.stdout + fail.stderr, /E_GROUP|E_RELEASE|FAIL/);

  const dir = mkdtempSync(path.join(tmpdir(), "vb-"));
  const draftCsv = path.join(dir, "draft.csv");
  writeFileSync(
    draftCsv,
    `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status
stray-kids,skz-this-and-that,standard,ktown4u,Ktown4u 预购特典,预购特典 K4,slots,https://example.invalid/k4,drafting
`,
  );
  const ok = spawnSync(tsx, [script, "--no-db", draftCsv], { encoding: "utf8", cwd: apiRoot });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /OK/);
});
