import { query } from "./db.js";
import { track } from "./analytics.js";
import { notFound } from "./errors.js";

const GROUP_SELECT = `id, slug, name_zh, name_en, name_ko, logo_color, scope_note, is_pilot`;

export async function listGroups() {
  const r = await query(
    `SELECT ${GROUP_SELECT} FROM idol_groups WHERE is_pilot = true ORDER BY slug`,
  );
  return r.rows.map(mapGroup);
}

export async function getGroup(idOrSlug: string) {
  const r = await query(
    `SELECT ${GROUP_SELECT} FROM idol_groups WHERE id::text = $1 OR slug = $1`,
    [idOrSlug],
  );
  if (!r.rows[0]) throw notFound("组合不存在");
  return mapGroup(r.rows[0]);
}

export async function listMembers(groupId: string) {
  const r = await query(
    `SELECT id, group_id, name_zh, name_en, color, sort_order
     FROM members WHERE group_id = $1 ORDER BY sort_order`,
    [groupId],
  );
  return r.rows;
}

export async function listReleases(groupId: string, includeDraft = false) {
  const r = await query(
    `SELECT id, group_id, title, title_zh, released_on, kind, status
     FROM releases
     WHERE group_id = $1 ${includeDraft ? "" : "AND status = 'published'"}
     ORDER BY released_on DESC`,
    [groupId],
  );
  return r.rows;
}

type SearchOpts = {
  q?: string;
  groupId?: string;
  releaseId?: string;
  memberId?: string;
  includeDraft?: boolean;
  userId?: string | null;
};

export async function searchTemplates(opts: SearchOpts) {
  const conds = ["1=1"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace("?", `$${params.length}`));
  };

  if (!opts.includeDraft) {
    conds.push("t.status = 'published' AND r.status = 'published'");
  }
  if (opts.groupId) add("r.group_id = ?", opts.groupId);
  if (opts.releaseId) add("t.release_id = ?", opts.releaseId);
  if (opts.memberId) add("t.member_id = ?", opts.memberId);
  if (opts.q) {
    const tokens = opts.q.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      params.push(`%${token}%`);
      conds.push(
        `(t.name ILIKE $${params.length} OR t.code ILIKE $${params.length} OR t.version ILIKE $${params.length} OR r.title ILIKE $${params.length} OR r.title_zh ILIKE $${params.length} OR m.name_en ILIKE $${params.length} OR m.name_zh ILIKE $${params.length} OR g.name_en ILIKE $${params.length} OR g.name_zh ILIKE $${params.length})`,
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
    logoColor: row.logo_color,
    scopeNote: row.scope_note,
    isPilot: row.is_pilot,
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
  };
}
