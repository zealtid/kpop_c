import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { AppError, badRequest, notFound } from "./errors.js";
import { sid } from "./ids.js";
import { mapTemplate } from "./catalog.js";
import { isReleaseKind, normalizeReleaseKind } from "./catalogConstants.js";
import { assertImportReleaseAllowed } from "./catalogConstraints.js";

type ImportTemplate = {
  code?: string;
  memberEn?: string;
  version: string;
  isBenefit?: boolean;
  isDeprecated?: boolean;
  status?: "draft" | "published";
  mainImageUrl?: string | null;
  name?: string;
};

export type ImportBody = {
  groupSlug: string;
  releaseTitle: string;
  releaseTitleZh?: string;
  releasedOn: string;
  kind?: string;
  templates: ImportTemplate[];
};

export type TemplateStatus = "draft" | "published" | "deprecated";

export function templateDedupeKey(
  groupSlug: string,
  releaseTitle: string,
  memberEn: string | null | undefined,
  version: string,
) {
  return `${groupSlug}:${releaseTitle}:${memberEn || "group"}:${version}`;
}

export function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

export function duplicatePublished(message = "已存在相同去重键的已发布模板") {
  return new AppError(409, "DUPLICATE_PUBLISHED", message);
}

export async function importCatalog(body: ImportBody) {
  if (!body?.groupSlug || !body.releaseTitle || !body.releasedOn) {
    throw badRequest("缺少 groupSlug / releaseTitle / releasedOn");
  }
  const group = await query("SELECT id FROM idol_groups WHERE slug = $1", [body.groupSlug]);
  if (!group.rows[0]) throw notFound("组合不存在，无法导入");
  const groupId = group.rows[0].id as string;
  const kind = normalizeReleaseKind(body.kind, "album");
  if (body.kind && !isReleaseKind(body.kind)) {
    throw badRequest("kind 必须是 album | single | mini | concert_md");
  }

  let release = await query(
    "SELECT id FROM releases WHERE group_id = $1 AND title = $2",
    [groupId, body.releaseTitle],
  );
  let releaseId: string;
  if (release.rows[0]) {
    releaseId = release.rows[0].id as string;
    assertImportReleaseAllowed({ groupSlug: body.groupSlug, releaseId, creating: false });
  } else {
    assertImportReleaseAllowed({ groupSlug: body.groupSlug, creating: true });
    releaseId = sid(`release:${body.groupSlug}:${body.releaseTitle}`);
    await query(
      `INSERT INTO releases (id, group_id, title, title_zh, released_on, kind, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'published')`,
      [
        releaseId,
        groupId,
        body.releaseTitle,
        body.releaseTitleZh || body.releaseTitle,
        body.releasedOn,
        kind || "album",
      ],
    );
  }

  const upserted = [];
  for (const t of body.templates || []) {
    if (!t.version) throw badRequest("模板缺少 version");
    const member = t.memberEn
      ? await query("SELECT id FROM members WHERE group_id = $1 AND name_en = $2", [
          groupId,
          t.memberEn,
        ])
      : { rows: [] as { id: string }[] };
    const memberId = member.rows[0]?.id ?? null;
    const dedupeKey = templateDedupeKey(body.groupSlug, body.releaseTitle, t.memberEn, t.version);
    const code = t.code || dedupeKey.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase();
    const status = t.status || "draft";
    const mainImageUrl = t.mainImageUrl ?? null;
    if (status === "published" && !mainImageUrl) {
      throw new AppError(400, "IMAGE_REQUIRED", "未设置主图的模板不能发布");
    }
    const existing = await query("SELECT id FROM templates WHERE dedupe_key = $1", [dedupeKey]);
    const id = existing.rows[0]?.id || sid(`tpl:${dedupeKey}`);
    await query(
      `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (dedupe_key) DO UPDATE SET
         name = EXCLUDED.name,
         is_benefit = EXCLUDED.is_benefit,
         is_deprecated = EXCLUDED.is_deprecated,
         status = EXCLUDED.status,
         main_image_url = EXCLUDED.main_image_url,
         member_id = EXCLUDED.member_id`,
      [
        id,
        releaseId,
        memberId,
        code,
        t.name || `${t.memberEn || "Group"} ${t.version}`,
        t.version,
        !!t.isBenefit,
        !!t.isDeprecated,
        status,
        mainImageUrl,
        dedupeKey,
      ],
    );
    upserted.push({ id, dedupeKey, code });
  }
  return { releaseId, upserted, count: upserted.length };
}

export async function assertNoPublishedDedupe(dedupeKey: string, exceptId?: string) {
  const r = await query<{ id: string }>(
    exceptId
      ? `SELECT id FROM templates
         WHERE dedupe_key = $1 AND id <> $2 AND status = 'published' AND is_deprecated = false`
      : `SELECT id FROM templates
         WHERE dedupe_key = $1 AND status = 'published' AND is_deprecated = false`,
    exceptId ? [dedupeKey, exceptId] : [dedupeKey],
  );
  if (r.rows[0]) throw duplicatePublished();
}

export async function setTemplateStatus(id: string, status: TemplateStatus) {
  if (status !== "draft" && status !== "published" && status !== "deprecated") {
    throw badRequest("status 只能是 draft、published 或 deprecated");
  }
  const r = await query(
    "SELECT id, main_image_url, status, is_deprecated, dedupe_key FROM templates WHERE id = $1",
    [id],
  );
  if (!r.rows[0]) throw notFound("模板不存在");
  if (status === "published") {
    if (!r.rows[0].main_image_url) {
      throw new AppError(400, "IMAGE_REQUIRED", "未设置主图的模板不能发布");
    }
    await assertNoPublishedDedupe(String(r.rows[0].dedupe_key), id);
    await query("UPDATE templates SET status = 'published', is_deprecated = false WHERE id = $1", [id]);
    return { id, status: "published" as const, isDeprecated: false };
  }
  if (status === "deprecated") {
    await query("UPDATE templates SET is_deprecated = true WHERE id = $1", [id]);
    return { id, status: "deprecated" as const, isDeprecated: true };
  }
  await query("UPDATE templates SET status = 'draft', is_deprecated = false WHERE id = $1", [id]);
  return { id, status: "draft" as const, isDeprecated: false };
}

async function loadReleaseIdentity(releaseId: string) {
  const rel = await query(
    `SELECT r.id, r.title, g.slug, g.id AS group_id
     FROM releases r JOIN idol_groups g ON g.id = r.group_id WHERE r.id = $1`,
    [releaseId],
  );
  if (!rel.rows[0]) throw notFound("发行不存在");
  return rel.rows[0] as { id: string; title: string; slug: string; group_id: string };
}

async function memberEnFor(memberId?: string | null) {
  if (!memberId) return "group";
  const member = await query("SELECT name_en FROM members WHERE id = $1", [memberId]);
  return (member.rows[0]?.name_en as string) || "group";
}

export async function createDraftTemplate(body: {
  releaseId: string;
  memberId?: string;
  version: string;
  name?: string;
  isBenefit?: boolean;
  mainImageUrl?: string | null;
  code?: string;
}) {
  if (!body.releaseId || !body.version) throw badRequest("缺少 releaseId / version");
  const rel = await loadReleaseIdentity(body.releaseId);
  const memberEn = await memberEnFor(body.memberId);
  const dedupeKey = templateDedupeKey(rel.slug, rel.title, memberEn, body.version);
  const existing = await query("SELECT id, status, is_deprecated FROM templates WHERE dedupe_key = $1", [
    dedupeKey,
  ]);
  if (existing.rows[0]) {
    if (existing.rows[0].status === "published" && !existing.rows[0].is_deprecated) {
      throw duplicatePublished();
    }
    throw new AppError(409, "DUPLICATE_DEDUPE_KEY", "去重键已存在");
  }
  const id = randomUUID();
  try {
    await query(
      `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,'draft',$8,$9)`,
      [
        id,
        body.releaseId,
        body.memberId || null,
        body.code || `DRAFT-${id.slice(0, 8)}`,
        body.name || `${memberEn} ${body.version}`,
        body.version,
        !!body.isBenefit,
        body.mainImageUrl || null,
        dedupeKey,
      ],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw duplicatePublished();
    throw err;
  }
  return { id, status: "draft", dedupeKey };
}

export async function getTemplate(id: string) {
  const r = await query(
    `SELECT t.id, t.code, t.name, t.version, t.is_benefit, t.is_deprecated, t.status,
            t.main_image_url, t.dedupe_key, t.release_id, t.member_id,
            r.title AS release_title, r.title_zh AS release_title_zh, r.released_on,
            r.group_id, g.slug AS group_slug, g.name_zh AS group_name_zh,
            m.name_en AS member_name_en, m.name_zh AS member_name_zh, m.color AS member_color
     FROM templates t
     JOIN releases r ON r.id = t.release_id
     JOIN idol_groups g ON g.id = r.group_id
     LEFT JOIN members m ON m.id = t.member_id
     WHERE t.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw notFound("模板不存在");
  return mapTemplate(r.rows[0]);
}

export async function updateTemplate(
  id: string,
  body: {
    releaseId?: string;
    memberId?: string | null;
    version?: string;
    name?: string;
    isBenefit?: boolean;
    mainImageUrl?: string | null;
    code?: string;
  },
) {
  const current = await query(
    "SELECT id, release_id, member_id, version, name, is_benefit, main_image_url, code, dedupe_key FROM templates WHERE id = $1",
    [id],
  );
  if (!current.rows[0]) throw notFound("模板不存在");
  const row = current.rows[0];
  const releaseId = body.releaseId || (row.release_id as string);
  const memberId = body.memberId === undefined ? (row.member_id as string | null) : body.memberId;
  const version = body.version != null ? String(body.version).trim() : String(row.version);
  if (!version) throw badRequest("version 不能为空");
  const rel = await loadReleaseIdentity(releaseId);
  const memberEn = await memberEnFor(memberId);
  const dedupeKey = templateDedupeKey(rel.slug, rel.title, memberEn, version);
  if (dedupeKey !== row.dedupe_key) {
    await assertNoPublishedDedupe(dedupeKey, id);
    const clash = await query("SELECT id FROM templates WHERE dedupe_key = $1 AND id <> $2", [dedupeKey, id]);
    if (clash.rows[0]) throw new AppError(409, "DUPLICATE_DEDUPE_KEY", "去重键已存在");
  }
  try {
    await query(
      `UPDATE templates SET
         release_id = $2,
         member_id = $3,
         version = $4,
         name = $5,
         is_benefit = $6,
         main_image_url = $7,
         code = $8,
         dedupe_key = $9
       WHERE id = $1`,
      [
        id,
        releaseId,
        memberId || null,
        version,
        body.name != null ? String(body.name) : row.name,
        body.isBenefit != null ? !!body.isBenefit : row.is_benefit,
        body.mainImageUrl !== undefined ? body.mainImageUrl || null : row.main_image_url,
        body.code != null ? String(body.code) : row.code,
        dedupeKey,
      ],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw duplicatePublished();
    throw err;
  }
  return getTemplate(id);
}
