import { query } from "./db.js";
import { getRelease } from "./catalog.js";
import { loadRuntimeChannelDictionary } from "./channelDictionary.js";
import {
  buildBenefitMatrix,
  type BenefitMatrix,
  type MatrixMapRow,
  type MatrixTemplate,
} from "./benefitMatrixBuild.js";

export * from "./benefitMatrixBuild.js";

type TemplateRow = {
  id: unknown;
  name: unknown;
  version: unknown;
  member_id: unknown;
  status: unknown;
  is_deprecated: unknown;
  main_image_url: unknown;
  slot_label?: unknown;
};

async function loadReleaseTemplates(releaseId: string, groupId: string): Promise<MatrixTemplate[]> {
  const hasSlotLabel = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'slot_label'`,
  );
  const slotCol = (hasSlotLabel.rowCount || 0) > 0 ? ", t.slot_label" : "";
  const r = await query(
    `SELECT t.id, t.name, t.version, t.member_id, t.status, t.is_deprecated, t.main_image_url${slotCol}
     FROM templates t
     WHERE t.release_id = $1`,
    [releaseId],
  );
  return (r.rows as TemplateRow[]).map((t) => ({
    id: String(t.id),
    groupId,
    releaseId,
    name: String(t.name),
    slotLabel: t.slot_label == null ? "" : String(t.slot_label),
    versionLabel: String(t.version),
    memberId: t.member_id == null ? null : String(t.member_id),
    status: String(t.status || "draft"),
    isDeprecated: !!t.is_deprecated,
    mainImageUrl: t.main_image_url == null ? null : String(t.main_image_url),
  }));
}

async function loadReleaseVersions(releaseId: string): Promise<string[]> {
  const r = await query(
    `SELECT DISTINCT version FROM templates WHERE release_id = $1 AND is_deprecated = false ORDER BY version`,
    [releaseId],
  );
  return r.rows.map((row) => String(row.version));
}

async function loadConfirmedMaps(releaseId: string): Promise<MatrixMapRow[]> {
  const r = await query(
    `SELECT id, version_label, channel_code, benefit_name_zh, maps_to_slot_labels,
            map_mode, status, benefit_batch, version_label_for_template
     FROM release_benefit_map
     WHERE release_id = $1 AND status = 'confirmed'
     ORDER BY version_label, channel_code, benefit_name_zh`,
    [releaseId],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    versionLabel: String(row.version_label),
    channelCode: String(row.channel_code),
    benefitNameZh: String(row.benefit_name_zh),
    mapsToSlotLabels: row.maps_to_slot_labels == null ? null : String(row.maps_to_slot_labels),
    mapMode: String(row.map_mode),
    status: String(row.status),
    benefitBatch: row.benefit_batch == null ? null : String(row.benefit_batch),
    versionLabelForTemplate: row.version_label_for_template == null ? null : String(row.version_label_for_template),
  }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LibraryBenefitRow = {
  channelCode: string;
  channelNameZh: string;
  benefitNameZh: string;
};

function optionalUuid(raw: unknown): string | null {
  const s = String(raw || "").trim();
  return UUID_RE.test(s) ? s : null;
}

/**
 * Guest-readable confirmed 特典 rows for the MP picker (词典对照表之外的发行矩阵)。
 * Optional groupId / releaseId narrow the list; invalid ids are ignored.
 */
export async function listLibraryBenefits(opts?: {
  groupId?: string;
  releaseId?: string;
}): Promise<LibraryBenefitRow[]> {
  const dict = await loadRuntimeChannelDictionary();
  const nameByCode = new Map(dict.channels.map((c) => [c.code, c.name_zh]));
  const params: string[] = [];
  const conds = ["m.status = 'confirmed'", "r.status = 'published'", "g.status = 'published'"];
  const releaseId = optionalUuid(opts?.releaseId);
  const groupId = optionalUuid(opts?.groupId);
  if (releaseId) {
    params.push(releaseId);
    conds.push(`m.release_id = $${params.length}::uuid`);
  } else if (groupId) {
    params.push(groupId);
    conds.push(`m.group_id = $${params.length}::uuid`);
  }
  const r = await query(
    `SELECT DISTINCT m.channel_code, m.benefit_name_zh
     FROM release_benefit_map m
     JOIN releases r ON r.id = m.release_id
     JOIN idol_groups g ON g.id = m.group_id
     WHERE ${conds.join(" AND ")}
     ORDER BY m.channel_code, m.benefit_name_zh
     LIMIT 400`,
    params,
  );
  const seen = new Set<string>();
  const rows: LibraryBenefitRow[] = [];
  for (const row of r.rows) {
    const channelCode = String(row.channel_code || "").trim();
    const benefitNameZh = String(row.benefit_name_zh || "").trim();
    if (!channelCode || !benefitNameZh) continue;
    const key = `${channelCode}|${benefitNameZh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      channelCode,
      channelNameZh: nameByCode.get(channelCode) || channelCode,
      benefitNameZh,
    });
  }
  return rows;
}

/**
 * Guest-readable version × confirmed-benefit matrix (刀 B).
 * Does not touch admin completeness / import / catalog publish.
 * Empty confirmed → empty=true, HTTP 200 (never 500).
 */
export async function getReleaseBenefitMatrix(releaseId: string): Promise<BenefitMatrix> {
  const release = await getRelease(releaseId, { requirePublished: true });
  const [versions, maps, templates] = await Promise.all([
    loadReleaseVersions(release.id),
    loadConfirmedMaps(release.id),
    loadReleaseTemplates(release.id, release.groupId),
  ]);
  return buildBenefitMatrix({
    release: {
      id: release.id,
      groupId: release.groupId,
      title: release.title,
      titleZh: release.titleZh,
      releasedOn: release.releasedOn,
      kind: release.kind,
      groupSlug: release.groupSlug,
      groupNameZh: release.groupNameZh,
    },
    versions,
    maps,
    templates,
    dict: await loadRuntimeChannelDictionary(),
  });
}
