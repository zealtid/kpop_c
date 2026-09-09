import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import { track } from "./analytics.js";
import { absoluteMediaUrl, deleteCustomImage, parseImagePayload, saveCustomImage } from "./storage.js";

/** 与 user_cards.condition 对齐 */
const CARD_CONDITIONS = ["mint", "near_mint", "excellent", "good", "poor"] as const;
type CardCondition = (typeof CARD_CONDITIONS)[number];
const NOTES_MAX_LENGTH = 500;
import { submitMediaCheckAsync } from "./moderation.js";

export const CUSTOM_BADGE = "自定义";
export const SHAREABLE_STATUSES = ["pending", "approved"] as const;
export const COLLECTION_STATUSES = ["pending", "approved"] as const;

type CustomRow = Record<string, unknown>;

const SELECT_SQL = `
  SELECT c.id, c.user_id, c.image_front, c.image_back, c.group_id, c.member_id,
         c.title, c.note, c.quantity, c.condition, c.moderation_status, c.moderation_trace_id,
         c.created_at, c.updated_at,
         g.slug AS group_slug, g.name_zh AS group_name_zh, g.logo_color AS group_logo_color,
         m.name_en AS member_name_en, m.name_zh AS member_name_zh, m.color AS member_color
  FROM user_custom_cards c
  LEFT JOIN idol_groups g ON g.id = c.group_id
  LEFT JOIN members m ON m.id = c.member_id
`;

export function mapCustomCard(row: CustomRow) {
  const status = String(row.moderation_status || "pending");
  return {
    id: row.id,
    kind: "custom" as const,
    custom: true,
    badge: CUSTOM_BADGE,
    imageFront: row.image_front,
    imageBack: row.image_back || null,
    mainImageUrl: row.image_front,
    groupId: row.group_id || null,
    groupSlug: row.group_slug || null,
    groupNameZh: row.group_name_zh || null,
    memberId: row.member_id || null,
    memberNameEn: row.member_name_en || null,
    memberNameZh: row.member_name_zh || null,
    memberColor: (row.member_color as string | null) || "#8a8494",
    title: row.title || null,
    note: row.note || null,
    notes: row.note || null,
    quantity: row.quantity as number,
    condition: (row.condition as string | null) || null,
    moderationStatus: status,
    moderationLabel: status === "pending" ? "审核中" : status === "rejected" ? "未通过" : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasOwn(obj: object, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseQuantity(value: unknown, fallback = 1) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest("quantity 必须 ≥ 1（撤销请删除行，禁止写 0）");
  }
  return n;
}

function parseCondition(value: unknown) {
  if (value === "" || value == null) return null;
  if (typeof value !== "string" || !CARD_CONDITIONS.includes(value as CardCondition)) {
    throw badRequest("无效的品相（mint / near_mint / excellent / good / poor）");
  }
  return value;
}

function parseNote(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") throw badRequest("note 必须是文本");
  const note = value.trim();
  if (note.length > NOTES_MAX_LENGTH) throw badRequest(`备注最多 ${NOTES_MAX_LENGTH} 字`);
  return note || null;
}

async function assertGroup(groupId: string | null) {
  if (!groupId) return;
  const r = await query("SELECT id FROM idol_groups WHERE id = $1", [groupId]);
  if (!r.rowCount) throw badRequest("组合不存在");
}

async function assertMember(memberId: string | null, groupId: string | null) {
  if (!memberId) return;
  const r = await query("SELECT id, group_id FROM members WHERE id = $1", [memberId]);
  if (!r.rowCount) throw badRequest("成员不存在");
  if (groupId && r.rows[0].group_id !== groupId) throw badRequest("成员不属于该组合");
}

export async function countVisibleCustom(userId: string, groupId?: string | null) {
  const params: unknown[] = [userId];
  let sql = `SELECT COUNT(*)::int AS n FROM user_custom_cards
             WHERE user_id = $1 AND moderation_status = ANY($2::text[])`;
  params.push([...COLLECTION_STATUSES]);
  if (groupId) {
    params.push(groupId);
    sql += ` AND group_id = $${params.length}`;
  }
  const r = await query<{ n: number }>(sql, params);
  return r.rows[0]?.n ?? 0;
}

export async function customCountsByGroup(userId: string) {
  const r = await query<{ group_id: string | null; n: number }>(
    `SELECT group_id, COUNT(*)::int AS n
     FROM user_custom_cards
     WHERE user_id = $1 AND moderation_status = ANY($2::text[])
     GROUP BY group_id`,
    [userId, [...COLLECTION_STATUSES]],
  );
  return r.rows;
}

export async function listCustomCards(
  userId: string,
  opts: { groupId?: string | null; includeRejected?: boolean; ungroupedOnly?: boolean } = {},
) {
  const params: unknown[] = [userId];
  const conds = ["c.user_id = $1"];
  if (!opts.includeRejected) {
    params.push([...COLLECTION_STATUSES]);
    conds.push(`c.moderation_status = ANY($${params.length}::text[])`);
  }
  if (opts.groupId) {
    params.push(opts.groupId);
    conds.push(`c.group_id = $${params.length}`);
  }
  if (opts.ungroupedOnly) conds.push("c.group_id IS NULL");
  const r = await query(
    `${SELECT_SQL} WHERE ${conds.join(" AND ")} ORDER BY c.created_at DESC`,
    params,
  );
  return r.rows.map(mapCustomCard);
}

export async function listShareableCustomCards(userId: string, groupId: string) {
  const r = await query(
    `${SELECT_SQL}
     WHERE c.user_id = $1 AND c.group_id = $2 AND c.moderation_status = ANY($3::text[])
     ORDER BY c.created_at ASC`,
    [userId, groupId, [...SHAREABLE_STATUSES]],
  );
  return r.rows.map(mapCustomCard);
}

export async function getCustomCard(userId: string, id: string) {
  const r = await query(`${SELECT_SQL} WHERE c.user_id = $1 AND c.id = $2`, [userId, id]);
  if (!r.rows[0]) throw notFound("自定义卡不存在");
  return mapCustomCard(r.rows[0]);
}

async function storeSide(opts: {
  userId: string;
  id: string;
  base64?: string;
  buffer?: Buffer;
  mimeType?: string;
  side: "front" | "back";
}) {
  if (!opts.base64 && !opts.buffer) return null;
  const parsed = parseImagePayload({
    base64: opts.base64,
    buffer: opts.buffer,
    mimeType: opts.mimeType,
  });
  const saved = await saveCustomImage({
    userId: opts.userId,
    id: opts.id,
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    side: opts.side,
  });
  return saved.publicPath;
}

export async function createCustomCard(
  userId: string,
  body: {
    imageFrontBase64?: string;
    imageBackBase64?: string;
    imageFront?: string;
    mimeType?: string;
    groupId?: string | null;
    memberId?: string | null;
    title?: string | null;
    note?: string | null;
    quantity?: unknown;
    condition?: unknown;
  },
  openid?: string,
) {
  const id = randomUUID();
  const groupId = body.groupId || null;
  const memberId = body.memberId || null;
  await assertGroup(groupId);
  await assertMember(memberId, groupId);

  let imageFront = body.imageFront || null;
  if (body.imageFrontBase64) {
    imageFront = await storeSide({
      userId,
      id,
      base64: body.imageFrontBase64,
      mimeType: body.mimeType,
      side: "front",
    });
  }
  if (!imageFront) throw badRequest("请上传正面卡图");

  const imageBack = body.imageBackBase64
    ? await storeSide({
        userId,
        id,
        base64: body.imageBackBase64,
        mimeType: body.mimeType,
        side: "back",
      })
    : null;

  const title = body.title ? String(body.title).trim().slice(0, 80) : null;
  const note = parseNote(body.note);
  const quantity = parseQuantity(body.quantity, 1);
  const condition = parseCondition(body.condition);

  const inserted = await query(
    `INSERT INTO user_custom_cards
       (id, user_id, image_front, image_back, group_id, member_id, title, note, quantity, condition, moderation_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
     RETURNING id`,
    [id, userId, imageFront, imageBack, groupId, memberId, title, note, quantity, condition],
  );

  const mediaUrl = absoluteMediaUrl(imageFront);
  const check = await submitMediaCheckAsync({
    mediaUrl,
    openid: openid || "unknown",
  });
  if (check.traceId) {
    await query(
      `UPDATE user_custom_cards SET moderation_trace_id = $2, updated_at = now() WHERE id = $1`,
      [id, check.traceId],
    );
  }

  await track(
    "custom_card_add",
    { id, groupId, moderation: "pending", checkSubmitted: check.submitted, checkReason: check.reason },
    userId,
  );

  const card = await getCustomCard(userId, inserted.rows[0].id as string);
  return {
    ...card,
    moderation: {
      status: card.moderationStatus,
      submitted: check.submitted,
      reason: check.reason,
      hookReady: check.hookReady,
    },
  };
}

export async function updateCustomCard(
  userId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const existing = await query(
    "SELECT * FROM user_custom_cards WHERE user_id = $1 AND id = $2",
    [userId, id],
  );
  if (!existing.rows[0]) throw notFound("自定义卡不存在");

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [userId, id];
  const add = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if (hasOwn(patch, "quantity")) add("quantity", parseQuantity(patch.quantity));
  if (hasOwn(patch, "condition")) add("condition", parseCondition(patch.condition));
  if (hasOwn(patch, "note") || hasOwn(patch, "notes")) {
    add("note", parseNote(patch.note ?? patch.notes));
  }
  if (hasOwn(patch, "title")) {
    const title = patch.title == null ? null : String(patch.title).trim().slice(0, 80) || null;
    add("title", title);
  }
  if (hasOwn(patch, "groupId")) {
    const groupId = patch.groupId ? String(patch.groupId) : null;
    await assertGroup(groupId);
    add("group_id", groupId);
  }
  if (hasOwn(patch, "memberId")) {
    const memberId = patch.memberId ? String(patch.memberId) : null;
    const groupId = hasOwn(patch, "groupId")
      ? patch.groupId
        ? String(patch.groupId)
        : null
      : (existing.rows[0].group_id as string | null);
    await assertMember(memberId, groupId);
    add("member_id", memberId);
  }
  if (hasOwn(patch, "imageBackBase64") && patch.imageBackBase64) {
    const path = await storeSide({
      userId,
      id,
      base64: String(patch.imageBackBase64),
      mimeType: typeof patch.mimeType === "string" ? patch.mimeType : undefined,
      side: "back",
    });
    add("image_back", path);
  }

  if (sets.length === 1) throw badRequest("没有可更新的字段");

  await query(
    `UPDATE user_custom_cards SET ${sets.join(", ")} WHERE user_id = $1 AND id = $2`,
    params,
  );
  return getCustomCard(userId, id);
}

export async function deleteCustomCard(userId: string, id: string) {
  const r = await query(
    "DELETE FROM user_custom_cards WHERE user_id = $1 AND id = $2 RETURNING image_front, image_back",
    [userId, id],
  );
  if (!r.rowCount) throw notFound("自定义卡不存在");
  await deleteCustomImage(r.rows[0].image_front as string);
  await deleteCustomImage(r.rows[0].image_back as string | null);
  await track("custom_card_remove", { id }, userId);
  return { deleted: true };
}
