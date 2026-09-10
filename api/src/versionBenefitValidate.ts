import { isUnknownChannel, normalizeChannelCode, type ChannelDictionary } from "./channelDictionary.js";
import {
  isBenefitStatus,
  isMapMode,
  splitSlotLabels,
  type BenefitMapRow,
  type BenefitParseIssue,
} from "./versionBenefitParse.js";

export const BENEFIT_ERROR_CODES = [
  "E_GROUP",
  "E_RELEASE",
  "E_VERSION",
  "E_CHANNEL",
  "E_EVIDENCE",
  "E_SLOT_EMPTY",
  "E_SLOT_MISS",
  "E_SLOT_AMBIG",
  "E_MEMBER",
] as const;

export type BenefitErrorCode = (typeof BENEFIT_ERROR_CODES)[number];

export type CatalogGroup = { id: string; slug: string };
export type CatalogRelease = {
  id: string;
  groupId: string;
  title: string;
  titleZh?: string | null;
  aliases?: string;
  versions: string[];
  /** When true, version_label `standard` is accepted even if not listed verbatim. */
  allowsStandard?: boolean;
};
export type CatalogMember = {
  id: string;
  groupId: string;
  nameEn: string;
  nameZh?: string | null;
};
export type CatalogTemplate = {
  id: string;
  groupId: string;
  releaseId: string;
  name: string;
  /**
   * 过渡口径（不取消未来 slot_label 模型）：
   * 有非空 slot_label 则只精确匹配 trim(slot_label)；否则精确匹配 name。禁止模糊。
   */
  slotLabel?: string | null;
  versionLabel: string;
  memberId: string | null;
};

/** Exact slot match: prefer trim(slot_label) when present, else name. No fuzzy / no space-fix. */
export function templateMatchesSlot(t: CatalogTemplate, slot: string): boolean {
  const want = slot;
  const label = String(t.slotLabel ?? "").trim();
  if (label) return label === want;
  return String(t.name ?? "") === want;
}

export type CatalogSnapshot = {
  groups: CatalogGroup[];
  releases: CatalogRelease[];
  members: CatalogMember[];
  templates: CatalogTemplate[];
  tagsStrict?: boolean;
};

export type ValidateBenefitOptions = {
  dict: ChannelDictionary;
  catalog: CatalogSnapshot;
};

export type BenefitRowResult = {
  row: BenefitMapRow;
  channelCode: string | null;
  group: CatalogGroup | null;
  release: CatalogRelease | null;
  issues: BenefitParseIssue[];
  ok: boolean;
};

function issue(
  level: BenefitParseIssue["level"],
  code: string,
  message: string,
  row: number,
  field?: string,
): BenefitParseIssue {
  return { level, code, message, row, field };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugifyReleaseKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function eqId(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findGroup(groups: CatalogGroup[], groupId: string): CatalogGroup | null {
  const raw = groupId.trim();
  if (!raw) return null;
  return groups.find((g) => eqId(g.id, raw) || eqId(g.slug, raw)) || null;
}

function releaseKeys(group: CatalogGroup, rel: CatalogRelease): string[] {
  const keys = [rel.id, rel.title];
  if (rel.titleZh) keys.push(rel.titleZh);
  if (rel.aliases) {
    for (const part of rel.aliases.split(/[,，]/)) {
      if (part.trim()) keys.push(part.trim());
    }
  }
  const titleSlug = slugifyReleaseKey(rel.title);
  if (titleSlug) {
    keys.push(titleSlug);
    keys.push(`${group.slug}-${titleSlug}`);
  }
  if (rel.titleZh) {
    const zhSlug = slugifyReleaseKey(rel.titleZh);
    if (zhSlug) {
      keys.push(zhSlug);
      keys.push(`${group.slug}-${zhSlug}`);
    }
  }
  return keys.map((k) => k.toLowerCase());
}

export function findRelease(
  catalog: CatalogSnapshot,
  group: CatalogGroup | null,
  releaseId: string,
): { release: CatalogRelease | null; ambiguous: boolean } {
  const raw = releaseId.trim();
  if (!raw) return { release: null, ambiguous: false };
  const needle = raw.toLowerCase();
  const pool = group ? catalog.releases.filter((r) => r.groupId === group.id) : catalog.releases;
  const hits: CatalogRelease[] = [];
  for (const rel of pool) {
    const g = catalog.groups.find((x) => x.id === rel.groupId);
    if (!g) continue;
    const keys = releaseKeys(g, rel);
    if (keys.includes(needle) || (UUID_RE.test(raw) && eqId(rel.id, raw))) hits.push(rel);
  }
  if (hits.length > 1) return { release: null, ambiguous: true };
  return { release: hits[0] || null, ambiguous: false };
}

export function versionAllowed(versionLabel: string, release: CatalogRelease): boolean {
  const v = versionLabel.trim();
  if (!v) return false;
  if (release.versions.some((x) => x.trim().toLowerCase() === v.toLowerCase())) return true;
  if (v.toLowerCase() === "standard" && (release.allowsStandard || release.versions.length === 0)) return true;
  return false;
}

function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function findMember(catalog: CatalogSnapshot, groupId: string, scope: string): CatalogMember | null {
  const raw = scope.trim();
  if (!raw) return null;
  return (
    catalog.members.find(
      (m) =>
        m.groupId === groupId &&
        (eqId(m.id, raw) || eqId(m.nameEn, raw) || (m.nameZh != null && eqId(m.nameZh, raw))),
    ) || null
  );
}

function templateVersionOf(row: BenefitMapRow) {
  return (row.version_label_for_template || row.version_label).trim();
}

/**
 * member_scope conventions (no dedicated column on templates):
 * - empty: any member_id
 * - all_random: member_id IS NULL (随机成员包)
 * - group: 组套，任意 member_id，至少一张
 * - otherwise: 成员 UUID / name_en / name_zh
 */
function matchTemplatesForSlot(
  catalog: CatalogSnapshot,
  group: CatalogGroup,
  release: CatalogRelease,
  slot: string,
  versionLabel: string,
  memberScope: string,
): { matches: CatalogTemplate[]; memberResolved: boolean; memberRequired: boolean } {
  const wantVersion = versionLabel.trim().toLowerCase();
  const bySlot = catalog.templates.filter(
    (t) => t.groupId === group.id && t.releaseId === release.id && templateMatchesSlot(t, slot),
  );
  const byVersion = bySlot.filter((t) => t.versionLabel.trim().toLowerCase() === wantVersion);
  const scope = memberScope.trim().toLowerCase();
  if (!scope) return { matches: byVersion, memberResolved: true, memberRequired: false };
  if (scope === "all_random") {
    return {
      matches: byVersion.filter((t) => t.memberId == null),
      memberResolved: true,
      memberRequired: true,
    };
  }
  if (scope === "group") {
    return { matches: byVersion, memberResolved: true, memberRequired: false };
  }
  const member = findMember(catalog, group.id, memberScope);
  if (!member) return { matches: [], memberResolved: false, memberRequired: true };
  return {
    matches: byVersion.filter((t) => t.memberId === member.id),
    memberResolved: true,
    memberRequired: true,
  };
}

function requiredFilled(row: BenefitMapRow, issues: BenefitParseIssue[]) {
  const fields: [keyof BenefitMapRow, string][] = [
    ["group_id", "group_id"],
    ["release_id", "release_id"],
    ["version_label", "version_label"],
    ["channel_code", "channel_code"],
    ["benefit_name_zh", "benefit_name_zh"],
    ["map_mode", "map_mode"],
    ["status", "status"],
  ];
  for (const [key, field] of fields) {
    if (!String(row[key] || "").trim()) {
      issues.push(issue("error", "MISSING_FIELD", `${field} 不能为空`, row.row, field));
    }
  }
}

/**
 * Pure per-row validator (VB01 / VB02). Catalog lookups are injected — no I/O.
 */
export function validateBenefitRow(row: BenefitMapRow, opts: ValidateBenefitOptions): BenefitRowResult {
  const issues: BenefitParseIssue[] = [];
  requiredFilled(row, issues);

  const mapMode = row.map_mode.trim();
  if (mapMode && !isMapMode(mapMode)) {
    issues.push(issue("error", "E_MAP_MODE", "map_mode 必须是 slots 或 benefit_only", row.row, "map_mode"));
  }
  const status = row.status.trim();
  if (status && !isBenefitStatus(status)) {
    issues.push(issue("error", "E_STATUS", "status 必须是 drafting | confirmed | retired", row.row, "status"));
  }

  const channelCode = row.channel_code.trim() ? normalizeChannelCode(row.channel_code, opts.dict) : null;
  if (row.channel_code.trim() && !channelCode) {
    issues.push(issue("error", "E_CHANNEL", `channel_code 不在通路词典：${row.channel_code}`, row.row, "channel_code"));
  }
  if (channelCode && isUnknownChannel(channelCode) && status === "confirmed") {
    issues.push(issue("error", "E_CHANNEL", "unknown 通路禁止 confirmed", row.row, "channel_code"));
  }

  const tags = row.tags_hint.trim();
  if (opts.catalog.tagsStrict && !tags && status === "confirmed") {
    issues.push(issue("error", "E_TAGS", "tags_strict 开启时 confirmed 需要 tags_hint", row.row, "tags_hint"));
  } else if (tags.includes("，")) {
    issues.push(issue("warning", "W_TAGS", "tags_hint 建议用英文逗号分隔，不阻挡 confirmed", row.row, "tags_hint"));
  }

  const confirmed = status === "confirmed";
  const group = findGroup(opts.catalog.groups, row.group_id);
  const releaseLookup = findRelease(opts.catalog, group, row.release_id);
  const release = releaseLookup.release;

  if (confirmed) {
    if (row.group_id.trim() && !group) {
      issues.push(issue("error", "E_GROUP", `组合不存在：${row.group_id}`, row.row, "group_id"));
    }
    if (row.release_id.trim()) {
      if (releaseLookup.ambiguous) {
        issues.push(issue("error", "E_RELEASE", `发行不唯一：${row.release_id}`, row.row, "release_id"));
      } else if (!release) {
        issues.push(issue("error", "E_RELEASE", `发行不存在或不属于该组合：${row.release_id}`, row.row, "release_id"));
      } else if (group && release.groupId !== group.id) {
        issues.push(issue("error", "E_RELEASE", "发行不属于该组合", row.row, "release_id"));
      }
    }
    if (release && row.version_label.trim() && !versionAllowed(row.version_label, release)) {
      issues.push(
        issue("error", "E_VERSION", `version_label 不在发行版本内：${row.version_label}`, row.row, "version_label"),
      );
    }
    if (!row.evidence_url.trim() || !isHttpUrl(row.evidence_url)) {
      issues.push(issue("error", "E_EVIDENCE", "confirmed 需要非空 http(s) evidence_url", row.row, "evidence_url"));
    }
  }

  if (confirmed && mapMode === "slots" && group && release) {
    const slots = splitSlotLabels(row.maps_to_slot_labels);
    if (!slots.length) {
      issues.push(issue("error", "E_SLOT_EMPTY", "map_mode=slots 时 maps_to_slot_labels 至少 1 个 slot", row.row, "maps_to_slot_labels"));
    } else {
      const wantVersion = templateVersionOf(row);
      for (const slot of slots) {
        const { matches, memberResolved, memberRequired } = matchTemplatesForSlot(
          opts.catalog,
          group,
          release,
          slot,
          wantVersion,
          row.member_scope,
        );
        const anySlot = opts.catalog.templates.some(
          (t) => t.groupId === group.id && t.releaseId === release.id && templateMatchesSlot(t, slot),
        );
        if (!anySlot) {
          issues.push(
            issue("error", "E_SLOT_MISS", `slot_label/name 均未命中：${slot}`, row.row, "maps_to_slot_labels"),
          );
          continue;
        }
        if (!memberResolved) {
          issues.push(issue("error", "E_MEMBER", `member_scope 无法解析：${row.member_scope}`, row.row, "member_scope"));
          continue;
        }
        if (!matches.length) {
          const byVersion = opts.catalog.templates.some(
            (t) =>
              t.groupId === group.id &&
              t.releaseId === release.id &&
              templateMatchesSlot(t, slot) &&
              t.versionLabel.trim().toLowerCase() === wantVersion.toLowerCase(),
          );
          if (!byVersion) {
            issues.push(
              issue("error", "E_SLOT_MISS", `slot 存在但 version 不匹配：${slot} / ${wantVersion}`, row.row, "maps_to_slot_labels"),
            );
          } else if (memberRequired) {
            issues.push(issue("error", "E_MEMBER", `slot 与 member_scope 不一致：${slot}`, row.row, "member_scope"));
          } else {
            issues.push(issue("error", "E_SLOT_MISS", `找不到匹配模板：${slot}`, row.row, "maps_to_slot_labels"));
          }
          continue;
        }
        const specificMember = memberRequired && row.member_scope.trim().toLowerCase() !== "all_random";
        if (specificMember && matches.length > 1) {
          issues.push(issue("error", "E_SLOT_AMBIG", `slot 匹配到多张模板：${slot}`, row.row, "maps_to_slot_labels"));
        }
        if (row.member_scope.trim().toLowerCase() === "all_random" && matches.length > 1) {
          issues.push(issue("error", "E_SLOT_AMBIG", `all_random slot 匹配到多张空成员模板：${slot}`, row.row, "maps_to_slot_labels"));
        }
      }
    }
  }

  if (confirmed && mapMode === "benefit_only" && row.maps_to_slot_labels.trim()) {
    issues.push(
      issue("warning", "W_SLOTS_IGNORED", "benefit_only 不用于自动拆卡，已忽略 maps_to_slot_labels", row.row, "maps_to_slot_labels"),
    );
  }

  return {
    row,
    channelCode,
    group,
    release,
    issues,
    ok: issues.every((i) => i.level !== "error"),
  };
}

export type BenefitReport = {
  ok: boolean;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: BenefitParseIssue[];
  rows: {
    row: number;
    ok: boolean;
    status: string;
    channelCode: string | null;
    groupId: string | null;
    releaseId: string | null;
    issues: BenefitParseIssue[];
  }[];
};

export function compileBenefitReport(
  parsedIssues: BenefitParseIssue[],
  results: BenefitRowResult[],
): BenefitReport {
  const issues = [...parsedIssues, ...results.flatMap((r) => r.issues)];
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;
  return {
    ok: errorCount === 0 && results.length > 0,
    rowCount: results.length,
    errorCount,
    warningCount,
    issues,
    rows: results.map((r) => ({
      row: r.row.row,
      ok: r.ok,
      status: r.row.status,
      channelCode: r.channelCode,
      groupId: r.group?.id || null,
      releaseId: r.release?.id || null,
      issues: r.issues,
    })),
  };
}

/** Validate every parsed row against an injected catalog snapshot. */
export function validateBenefitRows(
  rows: BenefitMapRow[],
  opts: ValidateBenefitOptions,
): BenefitRowResult[] {
  return rows.map((row) => validateBenefitRow(row, opts));
}
