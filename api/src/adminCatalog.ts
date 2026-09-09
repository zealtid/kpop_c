import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { AppError, badRequest, notFound } from "./errors.js";
import {
  type CatalogStatus,
  mapGroup,
  mapMember,
  mapRelease,
} from "./catalog.js";
import { isPgUniqueViolation } from "./admin.js";
import { RELEASE_KINDS, type ReleaseKind, isReleaseKind } from "./catalogConstants.js";
import { assertReleasePublishAllowed } from "./catalogConstraints.js";

export const CATALOG_STATUSES: CatalogStatus[] = ["draft", "published", "deprecated"];
export { RELEASE_KINDS, type ReleaseKind };

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const v = String(value || "");
  if (!(allowed as readonly string[]).includes(v)) {
    throw badRequest(`${field} 必须是 ${allowed.join(" | ")}`);
  }
  return v as T;
}

function text(value: unknown, field: string, required = false) {
  const v = value == null ? "" : String(value).trim();
  if (required && !v) throw badRequest(`${field} 不能为空`);
  return v;
}

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadGroupRow(id: string) {
  const r = await query(`SELECT * FROM idol_groups WHERE id = $1`, [id]);
  if (!r.rows[0]) throw notFound("组合不存在");
  return r.rows[0];
}

async function loadMemberRow(id: string) {
  const r = await query(
    `SELECT m.*, g.slug AS group_slug, g.name_zh AS group_name_zh
     FROM members m JOIN idol_groups g ON g.id = m.group_id WHERE m.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw notFound("成员不存在");
  return r.rows[0];
}

async function loadReleaseRow(id: string) {
  const r = await query(
    `SELECT r.*, g.slug AS group_slug, g.name_zh AS group_name_zh
     FROM releases r JOIN idol_groups g ON g.id = r.group_id WHERE r.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw notFound("发行不存在");
  return r.rows[0];
}

export async function listAdminGroups() {
  const r = await query(
    `SELECT id, slug, name_zh, name_en, name_ko, aliases, logo_color, scope_note, is_pilot, status
     FROM idol_groups ORDER BY slug`,
  );
  return r.rows.map(mapGroup);
}

export async function getAdminGroup(id: string) {
  return mapGroup(await loadGroupRow(id));
}

export async function createGroup(body: Record<string, unknown>) {
  const slug = slugify(text(body.slug, "slug", true));
  if (!slug) throw badRequest("slug 不能为空");
  const id = randomUUID();
  try {
    await query(
      `INSERT INTO idol_groups (id, slug, name_zh, name_en, name_ko, aliases, logo_color, scope_note, is_pilot, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')`,
      [
        id,
        slug,
        text(body.nameZh, "nameZh", true),
        text(body.nameEn, "nameEn", true),
        text(body.nameKo, "nameKo") || text(body.nameEn, "nameEn"),
        text(body.aliases, "aliases"),
        text(body.logoColor, "logoColor") || "#ff6b9d",
        text(body.scopeNote, "scopeNote") || null,
        body.isPilot !== false,
      ],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new AppError(409, "DUPLICATE_SLUG", "组合 slug 已存在");
    throw err;
  }
  return getAdminGroup(id);
}

export async function updateGroup(id: string, body: Record<string, unknown>) {
  const row = await loadGroupRow(id);
  const slug = body.slug != null ? slugify(text(body.slug, "slug", true)) : String(row.slug);
  try {
    await query(
      `UPDATE idol_groups SET
         slug = $2, name_zh = $3, name_en = $4, name_ko = $5, aliases = $6,
         logo_color = $7, scope_note = $8, is_pilot = $9
       WHERE id = $1`,
      [
        id,
        slug,
        body.nameZh != null ? text(body.nameZh, "nameZh", true) : row.name_zh,
        body.nameEn != null ? text(body.nameEn, "nameEn", true) : row.name_en,
        body.nameKo != null ? text(body.nameKo, "nameKo") : row.name_ko,
        body.aliases != null ? text(body.aliases, "aliases") : row.aliases,
        body.logoColor != null ? text(body.logoColor, "logoColor") : row.logo_color,
        body.scopeNote !== undefined ? text(body.scopeNote, "scopeNote") || null : row.scope_note,
        body.isPilot != null ? !!body.isPilot : row.is_pilot,
      ],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new AppError(409, "DUPLICATE_SLUG", "组合 slug 已存在");
    throw err;
  }
  return getAdminGroup(id);
}

export async function setGroupStatus(id: string, statusRaw: unknown) {
  const status = oneOf(statusRaw, CATALOG_STATUSES, "status");
  await loadGroupRow(id);
  await query("UPDATE idol_groups SET status = $2 WHERE id = $1", [id, status]);
  return getAdminGroup(id);
}

export async function listAdminMembers(groupId?: string) {
  const params: unknown[] = [];
  let where = "";
  if (groupId) {
    params.push(groupId);
    where = `WHERE m.group_id = $${params.length}`;
  }
  const r = await query(
    `SELECT m.id, m.group_id, m.name_zh, m.name_en, m.name_ko, m.aliases, m.color, m.sort_order, m.status,
            g.slug AS group_slug, g.name_zh AS group_name_zh
     FROM members m JOIN idol_groups g ON g.id = m.group_id
     ${where}
     ORDER BY g.slug, m.sort_order, m.name_en`,
    params,
  );
  return r.rows.map((row) => ({
    ...mapMember(row),
    groupSlug: String(row.group_slug),
    groupNameZh: String(row.group_name_zh),
  }));
}

export async function getAdminMember(id: string) {
  const row = await loadMemberRow(id);
  return { ...mapMember(row), groupSlug: String(row.group_slug), groupNameZh: String(row.group_name_zh) };
}

export async function createMember(body: Record<string, unknown>) {
  const groupId = text(body.groupId, "groupId", true);
  await loadGroupRow(groupId);
  const nameEn = text(body.nameEn, "nameEn", true);
  const dup = await query("SELECT id FROM members WHERE group_id = $1 AND name_en = $2", [groupId, nameEn]);
  if (dup.rows[0]) throw new AppError(409, "DUPLICATE_MEMBER", "该组合下已存在同名成员");
  const id = randomUUID();
  await query(
    `INSERT INTO members (id, group_id, name_zh, name_en, name_ko, aliases, color, sort_order, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
    [
      id,
      groupId,
      text(body.nameZh, "nameZh", true),
      nameEn,
      text(body.nameKo, "nameKo"),
      text(body.aliases, "aliases"),
      text(body.color, "color") || "#888888",
      Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    ],
  );
  return getAdminMember(id);
}

export async function updateMember(id: string, body: Record<string, unknown>) {
  const row = await loadMemberRow(id);
  const groupId = body.groupId != null ? text(body.groupId, "groupId", true) : String(row.group_id);
  if (body.groupId) await loadGroupRow(groupId);
  const nameEn = body.nameEn != null ? text(body.nameEn, "nameEn", true) : String(row.name_en);
  const dup = await query(
    "SELECT id FROM members WHERE group_id = $1 AND name_en = $2 AND id <> $3",
    [groupId, nameEn, id],
  );
  if (dup.rows[0]) throw new AppError(409, "DUPLICATE_MEMBER", "该组合下已存在同名成员");
  await query(
    `UPDATE members SET
       group_id = $2, name_zh = $3, name_en = $4, name_ko = $5, aliases = $6, color = $7, sort_order = $8
     WHERE id = $1`,
    [
      id,
      groupId,
      body.nameZh != null ? text(body.nameZh, "nameZh", true) : row.name_zh,
      nameEn,
      body.nameKo != null ? text(body.nameKo, "nameKo") : row.name_ko,
      body.aliases != null ? text(body.aliases, "aliases") : row.aliases,
      body.color != null ? text(body.color, "color") : row.color,
      body.sortOrder != null && Number.isInteger(Number(body.sortOrder))
        ? Number(body.sortOrder)
        : row.sort_order,
    ],
  );
  return getAdminMember(id);
}

export async function setMemberStatus(id: string, statusRaw: unknown) {
  const status = oneOf(statusRaw, CATALOG_STATUSES, "status");
  await loadMemberRow(id);
  await query("UPDATE members SET status = $2 WHERE id = $1", [id, status]);
  return getAdminMember(id);
}

export async function listAdminReleases(groupId?: string) {
  const params: unknown[] = [];
  let where = "";
  if (groupId) {
    params.push(groupId);
    where = `WHERE r.group_id = $${params.length}`;
  }
  const r = await query(
    `SELECT r.id, r.group_id, r.title, r.title_zh, r.aliases, r.released_on, r.kind, r.status, r.created_at,
            g.slug AS group_slug, g.name_zh AS group_name_zh
     FROM releases r JOIN idol_groups g ON g.id = r.group_id
     ${where}
     ORDER BY r.released_on DESC, r.title`,
    params,
  );
  return r.rows.map(mapRelease);
}

export async function getAdminRelease(id: string) {
  return mapRelease(await loadReleaseRow(id));
}

export async function createRelease(body: Record<string, unknown>) {
  const groupId = text(body.groupId, "groupId", true);
  await loadGroupRow(groupId);
  const title = text(body.title, "title", true);
  const releasedOn = text(body.releasedOn, "releasedOn", true);
  if (body.kind && !isReleaseKind(body.kind)) {
    throw badRequest("kind 必须是 album | single | mini | concert_md");
  }
  const kind = body.kind ? String(body.kind) : "album";
  const id = randomUUID();
  await query(
    `INSERT INTO releases (id, group_id, title, title_zh, aliases, released_on, kind, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')`,
    [
      id,
      groupId,
      title,
      text(body.titleZh, "titleZh") || title,
      text(body.aliases, "aliases"),
      releasedOn,
      kind || "album",
    ],
  );
  return getAdminRelease(id);
}

export async function updateRelease(id: string, body: Record<string, unknown>) {
  const row = await loadReleaseRow(id);
  const groupId = body.groupId != null ? text(body.groupId, "groupId", true) : String(row.group_id);
  if (body.groupId) await loadGroupRow(groupId);
  if (body.kind != null && body.kind !== "" && !isReleaseKind(body.kind)) {
    throw badRequest("kind 必须是 album | single | mini | concert_md");
  }
  await query(
    `UPDATE releases SET
       group_id = $2, title = $3, title_zh = $4, aliases = $5, released_on = $6, kind = $7
     WHERE id = $1`,
    [
      id,
      groupId,
      body.title != null ? text(body.title, "title", true) : row.title,
      body.titleZh != null ? text(body.titleZh, "titleZh") : row.title_zh,
      body.aliases != null ? text(body.aliases, "aliases") : row.aliases,
      body.releasedOn != null ? text(body.releasedOn, "releasedOn", true) : row.released_on,
      body.kind != null ? String(body.kind) : row.kind,
    ],
  );
  return getAdminRelease(id);
}

export async function setReleaseStatus(id: string, statusRaw: unknown) {
  const status = oneOf(statusRaw, CATALOG_STATUSES, "status");
  const row = await loadReleaseRow(id);
  if (status === "published") {
    assertReleasePublishAllowed(String(row.group_slug), id);
  }
  await query("UPDATE releases SET status = $2 WHERE id = $1", [id, status]);
  return getAdminRelease(id);
}
