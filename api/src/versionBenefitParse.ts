import { parseCsvText } from "./importParse.js";

export const MAP_MODES = ["slots", "benefit_only"] as const;
export type MapMode = (typeof MAP_MODES)[number];

export const BENEFIT_STATUSES = ["drafting", "confirmed", "retired"] as const;
export type BenefitStatus = (typeof BENEFIT_STATUSES)[number];

export type BenefitMapRow = {
  row: number;
  group_id: string;
  release_id: string;
  version_label: string;
  channel_code: string;
  benefit_name_zh: string;
  maps_to_slot_labels: string;
  map_mode: string;
  evidence_url: string;
  status: string;
  benefit_batch: string;
  benefit_type: string;
  member_scope: string;
  version_label_for_template: string;
  tags_hint: string;
  notes: string;
  updated_by: string;
  updated_at: string;
};

export type BenefitParseIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type ParsedBenefitCsv = {
  rows: BenefitMapRow[];
  issues: BenefitParseIssue[];
};

const REQUIRED_HEADERS = [
  "group_id",
  "release_id",
  "version_label",
  "channel_code",
  "benefit_name_zh",
  "map_mode",
  "status",
] as const;

const OPTIONAL_HEADERS = [
  "maps_to_slot_labels",
  "evidence_url",
  "benefit_batch",
  "benefit_type",
  "member_scope",
  "version_label_for_template",
  "tags_hint",
  "notes",
  "updated_by",
  "updated_at",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  group_id: "group_id",
  groupid: "group_id",
  group_slug: "group_id",
  release_id: "release_id",
  releaseid: "release_id",
  version_label: "version_label",
  versionlabel: "version_label",
  channel_code: "channel_code",
  channelcode: "channel_code",
  channel: "channel_code",
  benefit_name_zh: "benefit_name_zh",
  benefitnamezh: "benefit_name_zh",
  maps_to_slot_labels: "maps_to_slot_labels",
  mapstoslotlabels: "maps_to_slot_labels",
  map_mode: "map_mode",
  mapmode: "map_mode",
  evidence_url: "evidence_url",
  evidenceurl: "evidence_url",
  status: "status",
  benefit_batch: "benefit_batch",
  benefitbatch: "benefit_batch",
  benefit_type: "benefit_type",
  benefittype: "benefit_type",
  member_scope: "member_scope",
  memberscope: "member_scope",
  version_label_for_template: "version_label_for_template",
  versionlabelfortemplate: "version_label_for_template",
  tags_hint: "tags_hint",
  tagshint: "tags_hint",
  notes: "notes",
  updated_by: "updated_by",
  updatedby: "updated_by",
  updated_at: "updated_at",
  updatedat: "updated_at",
};

function normHeader(h: string) {
  return HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, "_")] || "";
}

function cell(rec: Record<string, string>, key: string) {
  return rec[key] ?? "";
}

export function emptyBenefitRow(row = 0): BenefitMapRow {
  return {
    row,
    group_id: "",
    release_id: "",
    version_label: "",
    channel_code: "",
    benefit_name_zh: "",
    maps_to_slot_labels: "",
    map_mode: "",
    evidence_url: "",
    status: "",
    benefit_batch: "",
    benefit_type: "",
    member_scope: "",
    version_label_for_template: "",
    tags_hint: "",
    notes: "",
    updated_by: "",
    updated_at: "",
  };
}

export function rowFromRecord(rec: Record<string, string>, row: number): BenefitMapRow {
  return {
    row,
    group_id: cell(rec, "group_id"),
    release_id: cell(rec, "release_id"),
    version_label: cell(rec, "version_label"),
    channel_code: cell(rec, "channel_code"),
    benefit_name_zh: cell(rec, "benefit_name_zh"),
    maps_to_slot_labels: cell(rec, "maps_to_slot_labels"),
    map_mode: cell(rec, "map_mode"),
    evidence_url: cell(rec, "evidence_url"),
    status: cell(rec, "status"),
    benefit_batch: cell(rec, "benefit_batch"),
    benefit_type: cell(rec, "benefit_type"),
    member_scope: cell(rec, "member_scope"),
    version_label_for_template: cell(rec, "version_label_for_template"),
    tags_hint: cell(rec, "tags_hint"),
    notes: cell(rec, "notes"),
    updated_by: cell(rec, "updated_by"),
    updated_at: cell(rec, "updated_at"),
  };
}

/**
 * Split maps_to_slot_labels on semicolon / newlines. Trim only; do not insert or collapse inner spaces.
 */
export function splitSlotLabels(raw: string): string[] {
  return String(raw || "")
    .split(/[;\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isMapMode(value: string): value is MapMode {
  return (MAP_MODES as readonly string[]).includes(value);
}

export function isBenefitStatus(value: string): value is BenefitStatus {
  return (BENEFIT_STATUSES as readonly string[]).includes(value);
}

/** Pure CSV → rows. Does not touch the catalog. */
export function parseBenefitCsv(text: string): ParsedBenefitCsv {
  const issues: BenefitParseIssue[] = [];
  const grid = parseCsvText(text);
  if (!grid.length) {
    issues.push({ level: "error", code: "EMPTY_BATCH", message: "没有可导入的行" });
    return { rows: [], issues };
  }
  const headers = grid[0].map(normHeader);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    issues.push({
      level: "error",
      code: "BAD_HEADER",
      message: `缺少表头：${missing.join(", ")}`,
    });
    return { rows: [], issues };
  }
  const rows: BenefitMapRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = cells[idx] ?? "";
    });
    const row = rowFromRecord(rec, i + 1);
    if (
      !row.group_id &&
      !row.release_id &&
      !row.version_label &&
      !row.channel_code &&
      !row.benefit_name_zh
    ) {
      continue;
    }
    rows.push(row);
  }
  if (!rows.length) {
    issues.push({ level: "error", code: "EMPTY_BATCH", message: "没有可导入的特典对照行" });
  }
  return { rows, issues };
}
