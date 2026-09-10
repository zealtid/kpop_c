import { query } from "./db.js";
import { loadChannelDictionary, type ChannelDictionary } from "./channelDictionary.js";
import { parseBenefitCsv, type BenefitMapRow } from "./versionBenefitParse.js";
import {
  compileBenefitReport,
  validateBenefitRows,
  type BenefitReport,
  type BenefitRowResult,
  type CatalogSnapshot,
} from "./versionBenefitValidate.js";

export type { BenefitReport, CatalogSnapshot };

function csvAliases(raw: unknown) {
  return raw == null ? "" : String(raw);
}

function parseOptionalTime(raw: string): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Build an in-memory catalog snapshot for the pure validator. */
export async function loadCatalogSnapshot(tagsStrict = false): Promise<CatalogSnapshot> {
  const groups = await query(`SELECT id, slug FROM idol_groups`);
  const releases = await query(
    `SELECT r.id, r.group_id, r.title, r.title_zh, r.aliases
     FROM releases r`,
  );
  const members = await query(`SELECT id, group_id, name_en, name_zh FROM members`);
  const templates = await query(
    `SELECT t.id, t.release_id, r.group_id, t.name, t.version, t.member_id, t.is_benefit
     FROM templates t
     JOIN releases r ON r.id = t.release_id`,
  );

  const versionsByRelease = new Map<string, Set<string>>();
  const nonBenefitByRelease = new Set<string>();
  for (const t of templates.rows) {
    const rid = String(t.release_id);
    const set = versionsByRelease.get(rid) || new Set<string>();
    set.add(String(t.version));
    versionsByRelease.set(rid, set);
    if (!t.is_benefit) nonBenefitByRelease.add(rid);
  }

  return {
    groups: groups.rows.map((g) => ({ id: String(g.id), slug: String(g.slug) })),
    releases: releases.rows.map((r) => {
      const id = String(r.id);
      const versions = [...(versionsByRelease.get(id) || [])];
      return {
        id,
        groupId: String(r.group_id),
        title: String(r.title),
        titleZh: r.title_zh == null ? null : String(r.title_zh),
        aliases: csvAliases(r.aliases),
        versions,
        allowsStandard: versions.some((v) => v.trim().toLowerCase() === "standard") || versions.length === 0,
      };
    }),
    members: members.rows.map((m) => ({
      id: String(m.id),
      groupId: String(m.group_id),
      nameEn: String(m.name_en),
      nameZh: m.name_zh == null ? null : String(m.name_zh),
    })),
    templates: templates.rows.map((t) => ({
      id: String(t.id),
      groupId: String(t.group_id),
      releaseId: String(t.release_id),
      slotLabel: String(t.name),
      versionLabel: String(t.version),
      memberId: t.member_id == null ? null : String(t.member_id),
    })),
    tagsStrict,
  };
}

export type BenefitValidateInput = {
  text?: string;
  tagsStrict?: boolean;
  commit?: boolean;
  importedBy?: string | null;
};

export type BenefitValidateOutput = {
  committed: boolean;
  report: BenefitReport;
  written: number;
  maps?: BenefitMapListItem[];
};

export async function previewOrCommitBenefitMap(
  body: BenefitValidateInput,
  dict?: ChannelDictionary,
): Promise<BenefitValidateOutput> {
  const parsed = parseBenefitCsv(String(body.text || ""));
  const catalog = await loadCatalogSnapshot(!!body.tagsStrict);
  const dictionary = dict || loadChannelDictionary();
  const results = validateBenefitRows(parsed.rows, { dict: dictionary, catalog });
  const report = compileBenefitReport(parsed.issues, results);
  if (!body.commit) {
    return { committed: false, report, written: 0 };
  }
  const written = await persistConfirmedRows(results, body.importedBy || null);
  return {
    committed: written.length > 0,
    report,
    written: written.length,
    maps: written,
  };
}

export type BenefitMapListItem = {
  id: string;
  groupId: string;
  groupSlug: string;
  releaseId: string;
  releaseTitle: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
  mapsToSlotLabels: string | null;
  mapMode: string;
  evidenceUrl: string | null;
  status: string;
  benefitBatch: string | null;
  benefitType: string | null;
  memberScope: string | null;
  versionLabelForTemplate: string | null;
  tagsHint: string | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  importedAt: string;
  importedBy: string | null;
};

function mapStoredRow(row: Record<string, unknown>): BenefitMapListItem {
  const updatedAt = row.updated_at;
  const importedAt = row.imported_at;
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    groupSlug: String(row.group_slug || ""),
    releaseId: String(row.release_id),
    releaseTitle: String(row.release_title || ""),
    versionLabel: String(row.version_label),
    channelCode: String(row.channel_code),
    benefitNameZh: String(row.benefit_name_zh),
    mapsToSlotLabels: row.maps_to_slot_labels == null ? null : String(row.maps_to_slot_labels),
    mapMode: String(row.map_mode),
    evidenceUrl: row.evidence_url == null ? null : String(row.evidence_url),
    status: String(row.status),
    benefitBatch: row.benefit_batch == null ? null : String(row.benefit_batch),
    benefitType: row.benefit_type == null ? null : String(row.benefit_type),
    memberScope: row.member_scope == null ? null : String(row.member_scope),
    versionLabelForTemplate: row.version_label_for_template == null ? null : String(row.version_label_for_template),
    tagsHint: row.tags_hint == null ? null : String(row.tags_hint),
    notes: row.notes == null ? null : String(row.notes),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : updatedAt
          ? String(updatedAt)
          : null,
    importedAt:
      importedAt instanceof Date ? importedAt.toISOString() : importedAt ? String(importedAt) : "",
    importedBy: row.imported_by == null ? null : String(row.imported_by),
  };
}

async function persistConfirmedRows(
  results: BenefitRowResult[],
  importedBy: string | null,
): Promise<BenefitMapListItem[]> {
  const written: BenefitMapListItem[] = [];
  for (const result of results) {
    if (!result.ok || result.row.status.trim() !== "confirmed") continue;
    if (!result.group || !result.release || !result.channelCode) continue;
    const row = result.row;
    const updatedAt = parseOptionalTime(row.updated_at);
    const saved = await query(
      `INSERT INTO release_benefit_map (
         group_id, release_id, version_label, channel_code, benefit_name_zh,
         maps_to_slot_labels, map_mode, evidence_url, status,
         benefit_batch, benefit_type, member_scope, version_label_for_template,
         tags_hint, notes, updated_by, updated_at, imported_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,$12,$13,$14,$15,$16,$17
       )
       ON CONFLICT (release_id, version_label, channel_code, benefit_name_zh)
       DO UPDATE SET
         group_id = EXCLUDED.group_id,
         maps_to_slot_labels = EXCLUDED.maps_to_slot_labels,
         map_mode = EXCLUDED.map_mode,
         evidence_url = EXCLUDED.evidence_url,
         status = 'confirmed',
         benefit_batch = EXCLUDED.benefit_batch,
         benefit_type = EXCLUDED.benefit_type,
         member_scope = EXCLUDED.member_scope,
         version_label_for_template = EXCLUDED.version_label_for_template,
         tags_hint = EXCLUDED.tags_hint,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at,
         imported_at = now(),
         imported_by = EXCLUDED.imported_by
       RETURNING id`,
      [
        result.group.id,
        result.release.id,
        row.version_label.trim(),
        result.channelCode,
        row.benefit_name_zh.trim(),
        row.maps_to_slot_labels || null,
        row.map_mode.trim(),
        row.evidence_url.trim(),
        row.benefit_batch || null,
        row.benefit_type || null,
        row.member_scope || null,
        row.version_label_for_template || null,
        row.tags_hint || null,
        row.notes || null,
        row.updated_by || null,
        updatedAt,
        importedBy,
      ],
    );
    const id = String(saved.rows[0].id);
    const listed = await listBenefitMaps({ id });
    if (listed[0]) written.push(listed[0]);
  }
  return written;
}

export async function listBenefitMaps(opts?: { releaseId?: string; groupId?: string; id?: string }) {
  const conds = ["1=1"];
  const params: unknown[] = [];
  if (opts?.id) {
    params.push(opts.id);
    conds.push(`m.id = $${params.length}`);
  }
  if (opts?.releaseId) {
    params.push(opts.releaseId);
    conds.push(`m.release_id::text = $${params.length}`);
  }
  if (opts?.groupId) {
    params.push(opts.groupId);
    conds.push(`(m.group_id::text = $${params.length} OR g.slug = $${params.length})`);
  }
  const r = await query(
    `SELECT m.*, g.slug AS group_slug, r.title AS release_title
     FROM release_benefit_map m
     JOIN idol_groups g ON g.id = m.group_id
     JOIN releases r ON r.id = m.release_id
     WHERE ${conds.join(" AND ")}
     ORDER BY r.title, m.channel_code, m.benefit_name_zh`,
    params,
  );
  return r.rows.map(mapStoredRow);
}
