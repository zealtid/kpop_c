import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { AppError, badRequest, notFound } from "./errors.js";
import { sid } from "./ids.js";

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

type ImportBody = {
  groupSlug: string;
  releaseTitle: string;
  releaseTitleZh?: string;
  releasedOn: string;
  kind?: string;
  templates: ImportTemplate[];
};

export async function importCatalog(body: ImportBody) {
  if (!body?.groupSlug || !body.releaseTitle || !body.releasedOn) {
    throw badRequest("缺少 groupSlug / releaseTitle / releasedOn");
  }
  const group = await query("SELECT id FROM idol_groups WHERE slug = $1", [body.groupSlug]);
  if (!group.rows[0]) throw notFound("组合不存在，无法导入");
  const groupId = group.rows[0].id as string;

  let release = await query(
    "SELECT id FROM releases WHERE group_id = $1 AND title = $2",
    [groupId, body.releaseTitle],
  );
  let releaseId: string;
  if (release.rows[0]) {
    releaseId = release.rows[0].id as string;
  } else {
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
        body.kind || "album",
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
    const dedupeKey = `${body.groupSlug}:${body.releaseTitle}:${t.memberEn || "group"}:${t.version}`;
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

export async function setTemplateStatus(id: string, status: "draft" | "published") {
  if (status !== "draft" && status !== "published") {
    throw badRequest("status 只能是 draft 或 published");
  }
  const r = await query(
    "SELECT id, main_image_url, status FROM templates WHERE id = $1",
    [id],
  );
  if (!r.rows[0]) throw notFound("模板不存在");
  if (status === "published" && !r.rows[0].main_image_url) {
    throw new AppError(400, "IMAGE_REQUIRED", "未设置主图的模板不能发布");
  }
  await query("UPDATE templates SET status = $2 WHERE id = $1", [id, status]);
  return { id, status };
}

export async function createDraftTemplate(body: {
  releaseId: string;
  memberId?: string;
  version: string;
  name?: string;
  isBenefit?: boolean;
  mainImageUrl?: string | null;
}) {
  if (!body.releaseId || !body.version) throw badRequest("缺少 releaseId / version");
  const rel = await query(
    `SELECT r.id, r.title, g.slug, g.id AS group_id
     FROM releases r JOIN idol_groups g ON g.id = r.group_id WHERE r.id = $1`,
    [body.releaseId],
  );
  if (!rel.rows[0]) throw notFound("发行不存在");
  const member = body.memberId
    ? await query("SELECT name_en FROM members WHERE id = $1", [body.memberId])
    : { rows: [] as { name_en: string }[] };
  const memberEn = member.rows[0]?.name_en || "group";
  const dedupeKey = `${rel.rows[0].slug}:${rel.rows[0].title}:${memberEn}:${body.version}`;
  const id = randomUUID();
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,false,'draft',$8,$9)`,
    [
      id,
      body.releaseId,
      body.memberId || null,
      `DRAFT-${id.slice(0, 8)}`,
      body.name || `${memberEn} ${body.version}`,
      body.version,
      !!body.isBenefit,
      body.mainImageUrl || null,
      dedupeKey,
    ],
  );
  return { id, status: "draft", dedupeKey };
}
