import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./db.js";
import { AppError, badRequest, forbidden, notFound } from "./errors.js";
import { templateDedupeKey } from "./admin.js";
import { track } from "./analytics.js";
import { submitMediaCheckAsync } from "./moderation.js";
import {
  CLARITY_EXTREME,
  clarityWarnings,
  computeDHash,
  hammingHex,
  isNearDuplicate,
  type ImageWarning,
} from "./imageHash.js";
import { awardApprovedSubmissionPoints } from "./contributionPoints.js";
import { gridSubmissionRules } from "./gridSubmissionRules.js";
import {
  absoluteMediaUrl,
  copyPendingToPublicCards,
  deleteStoredImage,
  isPendingMediaPath,
  parseImagePayload,
  readStoredImage,
  savePendingImage,
} from "./storage.js";

export const SUBMISSION_PENDING = "pending_review";
export const SUBMISSION_APPROVED = "approved";
export const SUBMISSION_REJECTED = "rejected";

const SLOT_MAX = 80;
const VERSION_MAX = 40;
const CHANNEL_MAX = 40;
const REASON_MAX = 500;

type Row = Record<string, unknown>;

function text(value: unknown, field: string, required = false, max = 200) {
  const v = value == null ? "" : String(value).trim();
  if (required && !v) throw badRequest(`${field} 不能为空`);
  if (v.length > max) throw badRequest(`${field}最多 ${max} 字`);
  return v || null;
}

function uuidOrNull(value: unknown) {
  if (value == null || value === "") return null;
  return String(value);
}

function iso(value: unknown) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const SELECT_SQL = `
  SELECT s.*,
         g.slug AS group_slug, g.name_zh AS group_name_zh, g.ugc_open,
         r.title AS release_title, r.title_zh AS release_title_zh,
         m.name_en AS member_name_en, m.name_zh AS member_name_zh,
         u.nickname AS user_nickname, u.avatar_url AS user_avatar_url
  FROM catalog_submissions s
  JOIN idol_groups g ON g.id = s.group_id
  JOIN users u ON u.id = s.user_id
  LEFT JOIN releases r ON r.id = s.release_id
  LEFT JOIN members m ON m.id = s.member_id
`;

export function mapSubmission(row: Row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    groupId: String(row.group_id),
    groupSlug: row.group_slug == null ? null : String(row.group_slug),
    groupNameZh: row.group_name_zh == null ? null : String(row.group_name_zh),
    releaseId: row.release_id == null ? null : String(row.release_id),
    releaseTitle: row.release_title == null ? null : String(row.release_title),
    memberId: row.member_id == null ? null : String(row.member_id),
    memberNameEn: row.member_name_en == null ? null : String(row.member_name_en),
    memberNameZh: row.member_name_zh == null ? null : String(row.member_name_zh),
    versionLabel: row.version_label == null ? null : String(row.version_label),
    slotLabel: String(row.slot_label),
    name: String(row.slot_label),
    channelCode: row.channel_code == null ? null : String(row.channel_code),
    imageFront: String(row.image_front),
    imageBack: row.image_back == null ? null : String(row.image_back),
    imageFrontThumb: row.image_front_thumb == null ? null : String(row.image_front_thumb),
    imageBackThumb: row.image_back_thumb == null ? null : String(row.image_back_thumb),
    phashFront: row.phash_front == null ? null : String(row.phash_front),
    status: String(row.status),
    rejectReason: row.reject_reason == null ? null : String(row.reject_reason),
    source: String(row.source),
    customCardId: row.custom_card_id == null ? null : String(row.custom_card_id),
    duplicateOfTemplateId: row.duplicate_of_template_id == null ? null : String(row.duplicate_of_template_id),
    reviewerId: row.reviewer_id == null ? null : String(row.reviewer_id),
    reviewedAt: iso(row.reviewed_at),
    resultTemplateId: row.result_template_id == null ? null : String(row.result_template_id),
    agreementAcceptedAt: iso(row.agreement_accepted_at),
    pointsAwarded: Number(row.points_awarded) || 0,
    userNickname: row.user_nickname == null ? null : String(row.user_nickname),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function withPublicMedia<T extends ReturnType<typeof mapSubmission>>(mapped: T) {
  return {
    ...mapped,
    imageFrontUrl: absoluteMediaUrl(mapped.imageFront),
    imageBackUrl: mapped.imageBack ? absoluteMediaUrl(mapped.imageBack) : null,
    imageFrontThumbUrl: mapped.imageFrontThumb ? absoluteMediaUrl(mapped.imageFrontThumb) : null,
  };
}

export async function purgePendingImages(paths: Array<string | null | undefined>) {
  for (const p of paths) {
    if (p && isPendingMediaPath(p)) await deleteStoredImage(p);
  }
}

async function assertUgcGroup(groupId: string) {
  const r = await query(
    "SELECT id, slug, name_zh, ugc_open, status FROM idol_groups WHERE id = $1",
    [groupId],
  );
  if (!r.rowCount) throw notFound("组合不存在");
  if (r.rows[0].status !== "published") throw badRequest("组合不可选");
  if (!r.rows[0].ugc_open) {
    throw new AppError(400, "UGC_CLOSED", "该组合暂未开放用户投稿入库");
  }
  return r.rows[0] as { id: string; slug: string; name_zh: string; ugc_open: boolean };
}

async function assertRelease(releaseId: string, groupId: string) {
  const r = await query("SELECT id, title, group_id, status FROM releases WHERE id = $1", [releaseId]);
  if (!r.rowCount) throw badRequest("专辑不存在");
  if (String(r.rows[0].group_id) !== groupId) throw badRequest("专辑不属于该组合");
  if (String(r.rows[0].status) !== "published") throw badRequest("专辑不可选");
  return r.rows[0] as { id: string; title: string };
}

async function assertMember(memberId: string | null, groupId: string) {
  if (!memberId) return null;
  const r = await query("SELECT id, name_en FROM members WHERE id = $1 AND group_id = $2", [
    memberId,
    groupId,
  ]);
  if (!r.rowCount) throw badRequest("成员不属于该组合");
  return r.rows[0] as { id: string; name_en: string };
}

export async function findNearDuplicateTemplates(phash: string, groupId: string) {
  if (!phash) return [] as { id: string; name: string; version: string; distance: number }[];
  const r = await query(
    `SELECT t.id, t.name, t.version, t.phash_front, t.main_image_url
     FROM templates t
     JOIN releases r ON r.id = t.release_id
     WHERE r.group_id = $1 AND t.status = 'published' AND t.is_deprecated = false
       AND t.phash_front IS NOT NULL
     LIMIT 200`,
    [groupId],
  );
  const hits: { id: string; name: string; version: string; distance: number }[] = [];
  for (const row of r.rows) {
    const other = String(row.phash_front || "");
    const distance = hammingHex(phash, other);
    if (isNearDuplicate(phash, other)) {
      hits.push({
        id: String(row.id),
        name: String(row.name),
        version: String(row.version),
        distance,
      });
    }
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, 8);
}

async function resolveDedupeTarget(opts: {
  groupSlug: string;
  releaseTitle: string;
  memberEn: string;
  version: string;
  mergeTemplateId?: string | null;
  duplicateOf?: string | null;
}) {
  if (opts.mergeTemplateId) {
    const t = await query("SELECT id, status, is_deprecated FROM templates WHERE id = $1", [
      opts.mergeTemplateId,
    ]);
    if (!t.rowCount) throw badRequest("合并目标模板不存在");
    return String(t.rows[0].id);
  }
  const key = templateDedupeKey(opts.groupSlug, opts.releaseTitle, opts.memberEn, opts.version);
  const existing = await query(
    `SELECT id FROM templates WHERE dedupe_key = $1 AND status = 'published' AND is_deprecated = false`,
    [key],
  );
  if (existing.rowCount) return String(existing.rows[0].id);
  if (opts.duplicateOf) {
    const t = await query(
      `SELECT id FROM templates WHERE id = $1 AND status = 'published' AND is_deprecated = false`,
      [opts.duplicateOf],
    );
    if (t.rowCount) return String(t.rows[0].id);
  }
  return null;
}

export async function uploadPendingMedia(
  userId: string,
  body: { imageBase64?: string; mimeType?: string; side?: string },
) {
  const parsed = parseImagePayload({ base64: body.imageBase64, mimeType: body.mimeType });
  const { variance, warnings } = await clarityWarnings(parsed.buffer);
  if (variance < CLARITY_EXTREME) {
    throw new AppError(400, "IMAGE_TOO_BLURRY", "图片过于模糊，请重新拍摄后再上传");
  }
  const id = randomUUID();
  const saved = await savePendingImage({
    userId,
    id,
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    side: body.side === "back" ? "back" : "front",
  });
  const phash = await computeDHash(saved.buffer);
  return {
    path: saved.publicPath,
    thumbPath: saved.thumbPath,
    phash,
    warnings,
    side: body.side === "back" ? "back" : "front",
  };
}

async function copyCustomSideToPending(userId: string, customPath: string | null, side: "front" | "back") {
  if (!customPath) return { path: null as string | null, thumbPath: null as string | null, buffer: null as Buffer | null };
  const img = await readStoredImage(customPath);
  if (!img) throw badRequest("私人卡图片不存在");
  const id = randomUUID();
  const saved = await savePendingImage({
    userId,
    id,
    buffer: img.body,
    mimeType: img.contentType,
    side,
  });
  return { path: saved.publicPath, thumbPath: saved.thumbPath, buffer: saved.buffer };
}

type CreateBody = {
  groupId?: string;
  releaseId?: string;
  memberId?: string;
  versionLabel?: string;
  slotLabel?: string;
  name?: string;
  channelCode?: string;
  imageFront?: string;
  imageBack?: string;
  imageFrontThumb?: string;
  imageBackThumb?: string;
  agreementAccepted?: boolean;
  customCardId?: string;
  source?: string;
  /** UGC-2b Mode B：近 dup 命中已发布模板则挂拥有，不建待审、不发 published */
  matchOwnIfDuplicate?: boolean;
};

function resolveSource(
  body: CreateBody,
  fallback: "direct_submit" | "from_custom_card" | "grid_page",
): "direct_submit" | "from_custom_card" | "grid_page" {
  if (body.source === "grid_page") return "grid_page";
  return fallback;
}

async function insertSubmission(
  userId: string,
  body: CreateBody,
  openid: string,
  source: "direct_submit" | "from_custom_card" | "grid_page",
) {
  if (!body.agreementAccepted) throw badRequest("请先勾选上传协议");
  const groupId = text(body.groupId, "groupId", true)!;
  const group = await assertUgcGroup(groupId);
  const releaseId = text(body.releaseId, "releaseId", true)!;
  const release = await assertRelease(releaseId, groupId);
  const memberId = uuidOrNull(body.memberId);
  const member = await assertMember(memberId, groupId);
  const slotLabel = text(body.slotLabel ?? body.name, "name", true, SLOT_MAX)!;
  const rules = gridSubmissionRules(source, body.matchOwnIfDuplicate);
  const versionLabel = text(body.versionLabel, "versionLabel", rules.versionRequired, VERSION_MAX);
  const channelCode = text(body.channelCode, "channelCode", false, CHANNEL_MAX);
  const imageFront = text(body.imageFront, "imageFront", true, 500)!;
  if (!isPendingMediaPath(imageFront)) throw badRequest("卡面必须使用待审桶路径");
  const imageBack = body.imageBack ? String(body.imageBack) : null;
  if (imageBack && !isPendingMediaPath(imageBack)) throw badRequest("卡背必须使用待审桶路径");

  const frontImg = await readStoredImage(imageFront);
  if (!frontImg) throw badRequest("卡面图片不存在");
  const { variance, warnings } = await clarityWarnings(frontImg.body);
  if (variance < CLARITY_EXTREME) {
    await purgePendingImages([imageFront, imageBack, body.imageFrontThumb, body.imageBackThumb]);
    throw new AppError(400, "IMAGE_TOO_BLURRY", "图片过于模糊，请重新拍摄后再上传");
  }
  const phash = await computeDHash(frontImg.body);
  const dups = await findNearDuplicateTemplates(phash, groupId);
  if (dups.length) {
    warnings.push({
      code: "NEAR_DUP",
      message: `图鉴中可能已有相似模板（${dups[0].name} ${dups[0].version}）`,
    });
  }

  if (rules.matchOwn && dups[0]) {
    await grantOwned(userId, dups[0].id);
    await purgePendingImages([imageFront, imageBack, body.imageFrontThumb, body.imageBackThumb]);
    await track(
      "catalog_grid_match_own",
      { templateId: dups[0].id, groupId, source },
      userId,
    );
    return {
      mode: "own" as const,
      status: "matched_own",
      templateId: dups[0].id,
      templateName: dups[0].name,
      templateVersion: dups[0].version,
      warnings,
      nearDuplicates: dups,
      groupSlug: group.slug,
      releaseTitle: release.title,
      memberEn: member?.name_en || null,
      // 匹配入册无 submission，不计 UGC 审批贡献积分
      pointsAwarded: 0,
    };
  }

  const id = randomUUID();
  await query(
    `INSERT INTO catalog_submissions (
       id, user_id, group_id, release_id, member_id, version_label, slot_label, channel_code,
       image_front, image_back, image_front_thumb, image_back_thumb, phash_front, status, source,
       custom_card_id, duplicate_of_template_id, agreement_accepted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending_review',$14,$15,$16,now()
     )`,
    [
      id,
      userId,
      groupId,
      releaseId,
      memberId,
      versionLabel,
      slotLabel,
      channelCode,
      imageFront,
      imageBack,
      body.imageFrontThumb || null,
      body.imageBackThumb || null,
      phash,
      source,
      uuidOrNull(body.customCardId),
      dups[0]?.id || null,
    ],
  );

  const check = await submitMediaCheckAsync({
    mediaUrl: absoluteMediaUrl(imageFront),
    openid: openid || "unknown",
  });
  if (check.traceId) {
    await query(
      `UPDATE catalog_submissions SET moderation_trace_id = $2, updated_at = now() WHERE id = $1`,
      [id, check.traceId],
    );
  }

  await track("catalog_submission_create", { id, groupId, source }, userId);
  const mapped = await getSubmissionForUser(userId, id);
  return {
    ...mapped,
    mode: "submit" as const,
    warnings,
    nearDuplicates: dups,
    moderation: { submitted: check.submitted, reason: check.reason, hookReady: check.hookReady },
    releaseTitle: release.title,
    memberEn: member?.name_en || null,
    groupSlug: group.slug,
  };
}

export async function createSubmission(userId: string, body: CreateBody, openid: string) {
  const fallback = body.customCardId ? "from_custom_card" : body.source === "grid_page" ? "grid_page" : "direct_submit";
  return insertSubmission(userId, body, openid, resolveSource(body, fallback));
}

export async function applyFromCustomCard(userId: string, customCardId: string, body: CreateBody, openid: string) {
  const r = await query("SELECT * FROM user_custom_cards WHERE id = $1", [customCardId]);
  if (!r.rowCount) throw notFound("自定义卡不存在");
  if (String(r.rows[0].user_id) !== userId) throw forbidden("只能申请本人的私人卡入库");
  const row = r.rows[0];
  const front = await copyCustomSideToPending(userId, String(row.image_front), "front");
  const back = await copyCustomSideToPending(
    userId,
    row.image_back ? String(row.image_back) : null,
    "back",
  );
  return insertSubmission(
    userId,
    {
      groupId: body.groupId || (row.group_id ? String(row.group_id) : undefined),
      releaseId: body.releaseId || (row.release_id ? String(row.release_id) : undefined),
      memberId: body.memberId || (row.member_id ? String(row.member_id) : undefined),
      versionLabel: body.versionLabel || (row.version_label ? String(row.version_label) : undefined),
      slotLabel: body.slotLabel || body.name || (row.title ? String(row.title) : undefined),
      channelCode: body.channelCode || (row.benefit_name ? String(row.benefit_name) : undefined),
      imageFront: front.path || undefined,
      imageBack: back.path || undefined,
      imageFrontThumb: front.thumbPath || undefined,
      imageBackThumb: back.thumbPath || undefined,
      agreementAccepted: body.agreementAccepted,
      customCardId,
    },
    openid,
    "from_custom_card",
  );
}

export async function listMine(userId: string) {
  const r = await query(`${SELECT_SQL} WHERE s.user_id = $1 ORDER BY s.created_at DESC`, [userId]);
  return r.rows.map(mapSubmission);
}

export async function getSubmissionForUser(userId: string, id: string) {
  const r = await query(`${SELECT_SQL} WHERE s.id = $1`, [id]);
  if (!r.rowCount) throw notFound("投稿不存在");
  if (String(r.rows[0].user_id) !== userId) throw forbidden("只能查看本人投稿");
  return mapSubmission(r.rows[0]);
}

export async function adminList(opts: {
  status?: string;
  groupId?: string;
  releaseId?: string;
  userId?: string;
}) {
  const conds = ["1=1"];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    conds.push(`s.status = $${params.length}`);
  }
  if (opts.groupId) {
    params.push(opts.groupId);
    conds.push(`s.group_id = $${params.length}`);
  }
  if (opts.releaseId) {
    params.push(opts.releaseId);
    conds.push(`s.release_id = $${params.length}`);
  }
  if (opts.userId) {
    const uid = String(opts.userId).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      throw badRequest("userId 无效");
    }
    params.push(uid);
    conds.push(`s.user_id = $${params.length}::uuid`);
  }
  const r = await query(
    `${SELECT_SQL} WHERE ${conds.join(" AND ")}
     ORDER BY CASE WHEN s.status = 'pending_review' THEN 0 ELSE 1 END, s.created_at DESC
     LIMIT 200`,
    params,
  );
  return r.rows.map((row) => withPublicMedia(mapSubmission(row)));
}

export async function adminGet(id: string) {
  const r = await query(`${SELECT_SQL} WHERE s.id = $1`, [id]);
  if (!r.rowCount) throw notFound("投稿不存在");
  const mapped = withPublicMedia(mapSubmission(r.rows[0]));
  const candidates = mapped.phashFront
    ? await findNearDuplicateTemplates(mapped.phashFront, mapped.groupId)
    : [];
  return { ...mapped, duplicateCandidates: candidates };
}

export async function adminMediaPath(id: string, side: string) {
  const row = await adminGet(id);
  if (side === "back") return row.imageBack;
  if (side === "thumb") return row.imageFrontThumb || row.imageFront;
  if (side === "front") return row.imageFront;
  return null;
}

async function grantOwned(userId: string, templateId: string) {
  // 仅写入 user_cards；不创建 catalog_submissions，故不会走审核通过记分。
  await query(
    `INSERT INTO user_cards (user_id, template_id, quantity)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, template_id) DO NOTHING`,
    [userId, templateId],
  );
}

export async function approveSubmission(
  id: string,
  body: {
    releaseId?: string;
    memberId?: string | null;
    versionLabel?: string;
    slotLabel?: string;
    name?: string;
    channelCode?: string;
    mergeTemplateId?: string | null;
    adoptSubmissionImage?: boolean;
  },
  reviewerId: string,
) {
  const loaded = await query(`${SELECT_SQL} WHERE s.id = $1`, [id]);
  if (!loaded.rowCount) throw notFound("投稿不存在");
  const row = loaded.rows[0];
  if (String(row.status) !== SUBMISSION_PENDING) throw badRequest("仅待审投稿可通过");

  const groupId = String(row.group_id);
  const group = await assertUgcGroup(groupId);
  const releaseId = body.releaseId ? String(body.releaseId) : String(row.release_id);
  const release = await assertRelease(releaseId, groupId);
  const memberId =
    body.memberId === undefined ? (row.member_id ? String(row.member_id) : null) : body.memberId;
  const member = await assertMember(memberId, groupId);
  const version = text(body.versionLabel ?? row.version_label, "versionLabel", true, VERSION_MAX)!;
  const name = text(body.slotLabel ?? body.name ?? row.slot_label, "name", true, SLOT_MAX)!;
  const channelCode = text(body.channelCode ?? row.channel_code, "channelCode", false, CHANNEL_MAX);
  const adopt = !!body.adoptSubmissionImage;
  const memberEn = member?.name_en || "group";

  const mergeId = await resolveDedupeTarget({
    groupSlug: group.slug,
    releaseTitle: release.title,
    memberEn,
    version,
    mergeTemplateId: body.mergeTemplateId,
    duplicateOf: row.duplicate_of_template_id ? String(row.duplicate_of_template_id) : null,
  });

  const frontName = `ugc-${id.slice(0, 8)}-front.jpg`;
  const backName = `ugc-${id.slice(0, 8)}-back.jpg`;
  const publicFront = await copyPendingToPublicCards(String(row.image_front), frontName);
  let publicBack: string | null = null;
  if (row.image_back) {
    publicBack = await copyPendingToPublicCards(String(row.image_back), backName);
  }
  const phash = row.phash_front ? String(row.phash_front) : null;

  const templateId = await withTransaction(async (client) => {
    let resultId = mergeId;
    if (mergeId) {
      const current = await client.query(
        "SELECT id, main_image_url, image_back FROM templates WHERE id = $1",
        [mergeId],
      );
      const sets = ["phash_front = COALESCE(phash_front, $2)"];
      const params: unknown[] = [mergeId, phash];
      const currentUrl = current.rows[0]?.main_image_url;
      if (adopt || !currentUrl) {
        params.push(publicFront);
        sets.push(`main_image_url = $${params.length}`);
      }
      if (publicBack && !current.rows[0]?.image_back) {
        params.push(publicBack);
        sets.push(`image_back = $${params.length}`);
      }
      await client.query(`UPDATE templates SET ${sets.join(", ")} WHERE id = $1`, params);
    } else {
      resultId = randomUUID();
      const dedupeKey = templateDedupeKey(group.slug, release.title, memberEn, version);
      const code = `UGC-${String(resultId).slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO templates (
           id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status,
           main_image_url, image_back, phash_front, dedupe_key, source
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,'published',$8,$9,$10,$11,'user_submission')`,
        [
          resultId,
          releaseId,
          memberId,
          code,
          name,
          version,
          !!String(version).includes("特典"),
          publicFront,
          publicBack,
          phash,
          dedupeKey,
        ],
      );
    }
    // OQ-P3-3：新建模板与 merge 进已有模板都记分；OQ-P3-1 首次通过 +1；按 submission_id 幂等。
    const pointsAwarded = await awardApprovedSubmissionPoints(client, {
      userId: String(row.user_id),
      submissionId: id,
    });
    await client.query(
      `UPDATE catalog_submissions SET
         status = 'approved',
         release_id = $2,
         member_id = $3,
         version_label = $4,
         slot_label = $5,
         channel_code = $8,
         result_template_id = $6,
         reviewer_id = $7,
         points_awarded = $9,
         reviewed_at = now(),
         updated_at = now()
       WHERE id = $1`,
      [id, releaseId, memberId, version, name, resultId, reviewerId, channelCode, pointsAwarded],
    );
    return resultId as string;
  });

  await grantOwned(String(row.user_id), templateId);
  await purgePendingImages([
    row.image_front as string,
    row.image_back as string | null,
    row.image_front_thumb as string | null,
    row.image_back_thumb as string | null,
  ]);

  return adminGet(id);
}

export async function rejectSubmission(id: string, reasonRaw: unknown, reviewerId: string) {
  const reason = text(reasonRaw, "reason", true, REASON_MAX)!;
  const r = await query(`${SELECT_SQL} WHERE s.id = $1`, [id]);
  if (!r.rowCount) throw notFound("投稿不存在");
  if (String(r.rows[0].status) !== SUBMISSION_PENDING) throw badRequest("仅待审投稿可驳回");
  await query(
    `UPDATE catalog_submissions SET
       status = 'rejected', reject_reason = $2, reviewer_id = $3, reviewed_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, reason, reviewerId],
  );
  await purgePendingImages([
    r.rows[0].image_front as string,
    r.rows[0].image_back as string | null,
    r.rows[0].image_front_thumb as string | null,
    r.rows[0].image_back_thumb as string | null,
  ]);
  return adminGet(id);
}

export async function reportTemplate(userId: string, templateId: string, textBody: unknown) {
  const body = String(textBody || "").trim();
  if (!body) throw badRequest("请填写举报原因");
  const t = await query("SELECT id FROM templates WHERE id = $1", [templateId]);
  if (!t.rowCount) throw notFound("模板不存在");
  const r = await query(
    `INSERT INTO missing_feedback (user_id, body, linked_template_id)
     VALUES ($1, $2, $3) RETURNING id, created_at`,
    [userId, `[举报] ${body}`, templateId],
  );
  await track("catalog_template_report", { templateId }, userId);
  return { id: r.rows[0].id, createdAt: r.rows[0].created_at };
}

export type { ImageWarning };
