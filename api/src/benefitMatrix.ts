import { query } from "./db.js";
import { getRelease } from "./catalog.js";
import {
  BENEFIT_MATRIX_INCOMPLETE_COPY,
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

export const BENEFIT_MAP_DEPRECATED_MESSAGE =
  "特典对照表已下线。请维护特典词典与小卡模板。";

export function deprecatedMapCollection() {
  return {
    deprecated: true as const,
    maps: [] as [],
    message: BENEFIT_MAP_DEPRECATED_MESSAGE,
  };
}

export function deprecatedMapWrite() {
  return {
    ...deprecatedMapCollection(),
    committed: false,
    written: 0,
    map: null as null,
    deleted: false,
    report: {
      ok: false,
      rowCount: 0,
      errorCount: 1,
      warningCount: 0,
      issues: [{ level: "error" as const, code: "DEPRECATED", message: BENEFIT_MAP_DEPRECATED_MESSAGE }],
    },
  };
}

/**
 * Soft-retired: map rows are no longer served. Keep the function so old MP pickers
 * still get HTTP 200 + empty list instead of 410.
 */
export async function listLibraryBenefits(_opts?: {
  groupId?: string;
  releaseId?: string;
}): Promise<LibraryBenefitRow[]> {
  return [];
}

/**
 * Soft-retired version × benefit matrix (刀 B).
 * Unpublished / missing release still 404; published releases return empty + deprecated.
 * Builder/loaders remain in-repo for a later hard-delete gate.
 */
export async function getReleaseBenefitMatrix(releaseId: string): Promise<BenefitMatrix> {
  const release = await getRelease(releaseId, { requirePublished: true });
  return {
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
    versions: [],
    empty: true,
    rows: [],
    completeness: { ready: false, ratio: 0, copy: BENEFIT_MATRIX_INCOMPLETE_COPY },
    deprecated: true,
  };
}
