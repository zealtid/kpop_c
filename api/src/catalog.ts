import { query } from "./db.js";
import { track } from "./analytics.js";
import { notFound } from "./errors.js";

const GROUP_SELECT = `id, slug, name_zh, name_en, name_ko, aliases, logo_color, scope_note, is_pilot, status`;
const MEMBER_SELECT = `id, group_id, name_zh, name_en, name_ko, aliases, color, sort_order, status`;

export type CatalogStatus = "draft" | "published" | "deprecated";

export async function listGroups(opts?: { includeUnpublished?: boolean }) {
  const statusFilter = opts?.includeUnpublished ? "" : "AND status = 'published'";
  const r = await query(
    `SELECT ${GROUP_SELECT} FROM idol_groups WHERE is_pilot = true ${statusFilter} ORDER BY slug`,
  );
  return r.rows.map(mapGroup);
}

export async function getGroup(idOrSlug: string, opts?: { requirePublished?: boolean }) {
  const r = await query(
    `SELECT ${GROUP_SELECT} FROM idol_groups WHERE id::text = $1 OR slug = $1`,
    [idOrSlug],
  );
  if (!r.rows[0]) throw notFound("组合不存在");
  if (opts?.requirePublished && r.rows[0].status !== "published") {
    throw notFound("组合不存在");
  }
  return mapGroup(r.rows[0]);
}

export function mapMember(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    nameZh: row.name_zh == null ? null : String(row.name_zh),
    nameEn: row.name_en == null ? null : String(row.name_en),
    nameKo: row.name_ko == null ? "" : String(row.name_ko),
    aliases: row.aliases == null ? "" : String(row.aliases),
    color: (row.color as string) || "#8a8494",
    sortOrder: row.sort_order as number,
    status: (row.status as CatalogStatus) || "published",
  };
}

export function mapRelease(row: Record<string, unknown>) {
  const releasedOn = row.released_on;
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    title: String(row.title),
    titleZh: row.title_zh == null ? null : String(row.title_zh),
    aliases: row.aliases == null ? "" : String(row.aliases),
    releasedOn:
      releasedOn instanceof Date
        ? releasedOn.toISOString().slice(0, 10)
        : releasedOn
          ? String(releasedOn).slice(0, 10)
          : null,
    kind: String(row.kind || "album"),
    status: (row.status as CatalogStatus) || "published",
    groupSlug: row.group_slug == null ? undefined : String(row.group_slug),
    groupNameZh: row.group_name_zh == null ? undefined : String(row.group_name_zh),
  };
}

export async function listMembers(groupId: string, includeUnpublished = false) {
  const statusFilter = includeUnpublished ? "" : "AND status = 'published'";
  const r = await query(
    `SELECT ${MEMBER_SELECT}
     FROM members WHERE group_id = $1 ${statusFilter} ORDER BY sort_order, name_en`,
    [groupId],
  );
  return r.rows.map(mapMember);
}

export async function listReleases(groupId: string, includeDraft = false) {
  // C-side hides draft and deprecated the same way (only published).
  const r = await query(
    `SELECT id, group_id, title, title_zh, released_on, kind, status
     FROM releases
     WHERE group_id = $1 ${includeDraft ? "" : "AND status NOT IN ('draft', 'deprecated')"}
     ORDER BY released_on DESC`,
    [groupId],
  );
  // Public C-side (catalog-group) reads released_on / kind on the raw row.
  return r.rows;
}

/** Guest catalog: published release only. Draft / deprecated / unknown → 404. */
export async function getRelease(id: string, opts?: { requirePublished?: boolean }) {
  const r = await query(
    `SELECT r.id, r.group_id, r.title, r.title_zh, r.aliases, r.released_on, r.kind, r.status,
            g.slug AS group_slug, g.name_zh AS group_name_zh, g.status AS group_status
     FROM releases r
     JOIN idol_groups g ON g.id = r.group_id
     WHERE r.id::text = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) throw notFound("发行不存在");
  if (opts?.requirePublished) {
    if (row.status !== "published" || row.group_status !== "published") {
      throw notFound("发行不存在");
    }
  }
  return mapRelease(row);
}

type SearchOpts = {
  q?: string;
  groupId?: string;
  releaseId?: string;
  memberId?: string;
  includeDraft?: boolean;
  userId?: string | null;
  status?: string;
};

export async function searchTemplates(opts: SearchOpts) {
  const conds = ["1=1"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace("?", `$${params.length}`));
  };

  if (!opts.includeDraft) {
    conds.push("t.status = 'published' AND r.status = 'published' AND g.status = 'published'");
  }
  if (opts.groupId) add("r.group_id = ?", opts.groupId);
  if (opts.releaseId) add("t.release_id = ?", opts.releaseId);
  if (opts.memberId) add("t.member_id = ?", opts.memberId);
  if (opts.status === "deprecated") {
    conds.push("t.is_deprecated = true");
  } else if (opts.status === "draft") {
    conds.push("t.status = 'draft' AND t.is_deprecated = false");
  } else if (opts.status === "published") {
    conds.push("t.status = 'published' AND t.is_deprecated = false");
  }
  if (opts.q) {
    const tokens = opts.q.split(/\s+/).filter(Boolean);
    // C02: en/zh + name_ko + lightweight aliases (comma-separated TEXT)
    const searchFields = [
      "t.name",
      "t.code",
      "t.version",
      "r.title",
      "r.title_zh",
      "r.aliases",
      "m.name_en",
      "m.name_zh",
      "m.name_ko",
      "m.aliases",
      "g.name_en",
      "g.name_zh",
      "g.name_ko",
      "g.aliases",
    ];
    for (const token of tokens) {
      params.push(`%${token}%`);
      conds.push(
        `(${searchFields.map((f) => `${f} ILIKE $${params.length}`).join(" OR ")})`,
      );
    }
  }

  const sql = `
    SELECT t.id, t.code, t.name, t.version, t.is_benefit, t.is_deprecated, t.status,
           t.main_image_url, t.dedupe_key, t.release_id, t.member_id,
           r.title AS release_title, r.title_zh AS release_title_zh, r.released_on,
           r.group_id, g.slug AS group_slug, g.name_zh AS group_name_zh,
           m.name_en AS member_name_en, m.name_zh AS member_name_zh, m.color AS member_color
    FROM templates t
    JOIN releases r ON r.id = t.release_id
    JOIN idol_groups g ON g.id = r.group_id
    LEFT JOIN members m ON m.id = t.member_id
    WHERE ${conds.join(" AND ")}
    ORDER BY r.released_on DESC, m.sort_order NULLS LAST, t.version
    LIMIT 200
  `;
  const r = await query(sql, params);
  if (opts.q !== undefined) {
    await track(
      "catalog_search",
      { q: opts.q, empty: r.rows.length === 0, count: r.rows.length },
      opts.userId,
    );
  }
  return r.rows.map(mapTemplate);
}

export function mapGroup(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    nameKo: row.name_ko,
    aliases: row.aliases == null ? "" : String(row.aliases),
    logoColor: row.logo_color,
    scopeNote: row.scope_note,
    isPilot: row.is_pilot,
    status: (row.status as CatalogStatus) || "published",
  };
}

export function mapTemplate(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    version: row.version,
    isBenefit: row.is_benefit,
    isDeprecated: row.is_deprecated,
    status: row.status,
    mainImageUrl: row.main_image_url,
    dedupeKey: row.dedupe_key,
    releaseId: row.release_id,
    releaseTitle: row.release_title,
    releaseTitleZh: row.release_title_zh,
    releasedOn: row.released_on,
    memberId: row.member_id,
    memberNameEn: row.member_name_en,
    memberNameZh: row.member_name_zh,
    memberColor: row.member_color,
    groupId: row.group_id,
    groupSlug: row.group_slug,
    groupNameZh: row.group_name_zh,
    catalogStatus: row.is_deprecated ? "deprecated" : row.status,
  };
}
