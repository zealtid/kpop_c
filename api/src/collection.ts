import { query, withTransaction } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import { track } from "./analytics.js";
import { getGroup, mapGroup, mapTemplate } from "./catalog.js";

const PROGRESS_SQL = `
  SELECT
    g.id AS group_id,
    COUNT(t.id) FILTER (
      WHERE t.status = 'published' AND r.status = 'published' AND t.is_deprecated = false
    )::int AS published_count,
    COUNT(t.id) FILTER (
      WHERE t.status = 'published' AND r.status = 'published' AND t.is_deprecated = false AND t.is_benefit = true
    )::int AS benefit_count,
    COUNT(DISTINCT uc.template_id) FILTER (
      WHERE t.status = 'published' AND r.status = 'published' AND t.is_deprecated = false
        AND uc.user_id = $1
    )::int AS owned_distinct
  FROM idol_groups g
  JOIN releases r ON r.group_id = g.id
  JOIN templates t ON t.release_id = r.id
  LEFT JOIN user_cards uc ON uc.template_id = t.id AND uc.user_id = $1
  WHERE g.id = ANY($2::uuid[])
  GROUP BY g.id
`;

export const PROGRESS_COPY =
  "进度 = 已拥有不重复模板数 / 范围内已发布模板数（含特典，不含已废弃）";

/** 品相枚举：全新 / 近全新 / 优秀 / 良好 / 较差；可空 */
export const CARD_CONDITIONS = ["mint", "near_mint", "excellent", "good", "poor"] as const;
export type CardCondition = (typeof CARD_CONDITIONS)[number];
export const NOTES_MAX_LENGTH = 500;

const OWNED_CARD_SQL = `
  SELECT t.*, r.title AS release_title, r.title_zh AS release_title_zh, r.released_on,
         r.group_id, g.slug AS group_slug, g.name_zh AS group_name_zh,
         m.name_en AS member_name_en, m.name_zh AS member_name_zh, m.color AS member_color,
         uc.quantity, uc.condition, uc.notes
  FROM user_cards uc
  JOIN templates t ON t.id = uc.template_id
  JOIN releases r ON r.id = t.release_id
  JOIN idol_groups g ON g.id = r.group_id
  LEFT JOIN members m ON m.id = t.member_id
`;

function mapOwnedCard(row: Record<string, unknown>) {
  return {
    ...mapTemplate(row),
    quantity: row.quantity as number,
    condition: (row.condition as string | null) || null,
    notes: (row.notes as string | null) || null,
  };
}

export async function progressForGroups(userId: string | null, groupIds: string[]) {
  if (!groupIds.length) return [];
  const r = await query(PROGRESS_SQL, [userId, groupIds]);
  return r.rows as {
    group_id: string;
    published_count: number;
    benefit_count: number;
    owned_distinct: number;
  }[];
}

function toProgress(row: {
  published_count: number;
  benefit_count: number;
  owned_distinct: number;
}) {
  const total = row.published_count;
  const owned = row.owned_distinct;
  return {
    ownedDistinct: owned,
    publishedCount: total,
    benefitCount: row.benefit_count,
    ratio: total === 0 ? 0 : owned / total,
    copy: PROGRESS_COPY,
  };
}

export async function overview(userId: string | null) {
  const groups = await query(
    `SELECT id, slug, name_zh, name_en, name_ko, logo_color, scope_note, is_pilot
     FROM idol_groups WHERE is_pilot = true ORDER BY slug`,
  );
  const ids = groups.rows.map((g) => g.id as string);
  const progress = userId ? await progressForGroups(userId, ids) : [];
  const pmap = new Map(progress.map((p) => [p.group_id, p]));
  return {
    copy: PROGRESS_COPY,
    searchEnabled: false,
    groups: groups.rows.map((g) => {
      const p = pmap.get(g.id as string) || {
        published_count: 0,
        benefit_count: 0,
        owned_distinct: 0,
      };
      return {
        ...mapGroup(g),
        progress: toProgress(p),
      };
    }),
  };
}

export async function groupDetail(userId: string, groupKey: string) {
  const group = await getGroup(groupKey);
  const [prog] = await progressForGroups(userId, [group.id as string]);
  const owned = await query(
    `${OWNED_CARD_SQL}
     WHERE uc.user_id = $1 AND r.group_id = $2
     ORDER BY m.sort_order NULLS LAST, r.released_on, t.version`,
    [userId, group.id],
  );
  const wants = await query(
    `SELECT t.*, r.title AS release_title, r.title_zh AS release_title_zh, r.released_on,
            r.group_id, g.slug AS group_slug, g.name_zh AS group_name_zh,
            m.name_en AS member_name_en, m.name_zh AS member_name_zh, m.color AS member_color
     FROM user_wants w
     JOIN templates t ON t.id = w.template_id
     JOIN releases r ON r.id = t.release_id
     JOIN idol_groups g ON g.id = r.group_id
     LEFT JOIN members m ON m.id = t.member_id
     WHERE w.user_id = $1 AND r.group_id = $2
     ORDER BY m.sort_order NULLS LAST, t.version`,
    [userId, group.id],
  );
  const ownedCards = owned.rows.map(mapOwnedCard);
  return {
    group,
    progress: toProgress(
      prog || { published_count: 0, benefit_count: 0, owned_distinct: 0 },
    ),
    copy: PROGRESS_COPY,
    tabs: ["拥有", "想要", "重复"],
    owned: ownedCards,
    wanted: wants.rows.map(mapTemplate),
    duplicates: ownedCards.filter((c) => c.quantity > 1),
  };
}

type OwnItem = { templateId: string; quantity?: number };

export async function ownCards(userId: string, items: OwnItem[]) {
  if (!items?.length) throw badRequest("请选择要拥有的卡片");
  const cleaned = items.map((it) => ({
    templateId: it.templateId,
    quantity: it.quantity ?? 1,
  }));
  for (const it of cleaned) {
    if (!it.templateId) throw badRequest("缺少 templateId");
    if (!Number.isInteger(it.quantity) || it.quantity < 1) {
      throw badRequest("quantity 必须 ≥ 1（撤销请删除行，禁止写 0）");
    }
  }

  const result = await withTransaction(async (client) => {
    const ids = cleaned.map((i) => i.templateId);
    const found = await client.query(
      "SELECT id FROM templates WHERE id = ANY($1::uuid[])",
      [ids],
    );
    if (found.rowCount !== ids.length) throw notFound("存在未知模板");

    for (const it of cleaned) {
      await client.query(
        `INSERT INTO user_cards (user_id, template_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, template_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [userId, it.templateId, it.quantity],
      );
    }
    // own → auto remove want
    await client.query(
      "DELETE FROM user_wants WHERE user_id = $1 AND template_id = ANY($2::uuid[])",
      [userId, ids],
    );
    return { count: cleaned.length, templateIds: ids };
  });

  await track(
    "card_own_add",
    { n: result.count, batch: result.count > 1, templateIds: result.templateIds },
    userId,
  );
  return result;
}

export async function getOwnedCard(userId: string, templateId: string) {
  const r = await query(`${OWNED_CARD_SQL} WHERE uc.user_id = $1 AND uc.template_id = $2`, [
    userId,
    templateId,
  ]);
  if (!r.rows[0]) throw notFound("尚未拥有该卡");
  return mapOwnedCard(r.rows[0]);
}

type OwnedCardPatch = {
  quantity?: unknown;
  condition?: unknown;
  notes?: unknown;
};

function hasOwn(obj: object, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export async function updateOwnedCard(userId: string, templateId: string, patch: OwnedCardPatch) {
  const body = patch && typeof patch === "object" ? patch : {};
  const hasQuantity = hasOwn(body, "quantity");
  const hasCondition = hasOwn(body, "condition");
  const hasNotes = hasOwn(body, "notes");
  if (!hasQuantity && !hasCondition && !hasNotes) {
    throw badRequest("请提供 quantity、condition 或 notes");
  }

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [userId, templateId];

  if (hasQuantity) {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw badRequest("quantity 必须 ≥ 1（撤销请删除行，禁止写 0）");
    }
    params.push(quantity);
    sets.push(`quantity = $${params.length}`);
  }

  if (hasCondition) {
    let condition = body.condition;
    if (condition === "" || condition === null) {
      condition = null;
    } else if (
      typeof condition !== "string" ||
      !CARD_CONDITIONS.includes(condition as CardCondition)
    ) {
      throw badRequest("无效的品相（mint / near_mint / excellent / good / poor）");
    }
    params.push(condition);
    sets.push(`condition = $${params.length}`);
  }

  if (hasNotes) {
    let notes: string | null;
    if (body.notes === null) {
      notes = null;
    } else if (typeof body.notes !== "string") {
      throw badRequest("notes 必须是文本");
    } else {
      notes = body.notes.trim();
      if (notes.length > NOTES_MAX_LENGTH) {
        throw badRequest(`备注最多 ${NOTES_MAX_LENGTH} 字`);
      }
      if (!notes) notes = null;
    }
    params.push(notes);
    sets.push(`notes = $${params.length}`);
  }

  const r = await query(
    `UPDATE user_cards SET ${sets.join(", ")}
     WHERE user_id = $1 AND template_id = $2
     RETURNING template_id, quantity, condition, notes`,
    params,
  );
  if (!r.rowCount) throw notFound("尚未拥有该卡");
  const row = r.rows[0];
  return {
    templateId: row.template_id as string,
    quantity: row.quantity as number,
    condition: (row.condition as string | null) || null,
    notes: (row.notes as string | null) || null,
  };
}

export async function removeOwn(userId: string, templateId: string) {
  const r = await query(
    "DELETE FROM user_cards WHERE user_id = $1 AND template_id = $2 RETURNING id",
    [userId, templateId],
  );
  if (!r.rowCount) throw notFound("尚未拥有该卡");
  // un-own does NOT re-add want
  await track("card_own_remove", { templateId }, userId);
  return { deleted: true, wantRestored: false };
}

/** 已拥有再点想要：HTTP 200 + 业务码，供小程序 Toast 识别，不写库。 */
export const OWN_WANT_MUTEX = "OWN_WANT_MUTEX";

export async function addWant(userId: string, templateId: string) {
  const owned = await query(
    "SELECT 1 FROM user_cards WHERE user_id = $1 AND template_id = $2",
    [userId, templateId],
  );
  if (owned.rowCount) {
    return {
      code: OWN_WANT_MUTEX,
      message: "已拥有，无法加入想要",
      wanted: false,
      templateId,
    };
  }
  const exists = await query("SELECT 1 FROM templates WHERE id = $1", [templateId]);
  if (!exists.rowCount) throw notFound("模板不存在");
  await query(
    `INSERT INTO user_wants (user_id, template_id) VALUES ($1, $2)
     ON CONFLICT (user_id, template_id) DO NOTHING`,
    [userId, templateId],
  );
  await track("card_want_add", { templateId }, userId);
  return { templateId, wanted: true };
}

export async function removeWant(userId: string, templateId: string) {
  await query("DELETE FROM user_wants WHERE user_id = $1 AND template_id = $2", [
    userId,
    templateId,
  ]);
  await track("card_want_remove", { templateId }, userId);
  return { deleted: true };
}

export async function getFollows(userId: string) {
  const r = await query(
    `SELECT g.id, g.slug, g.name_zh, g.name_en, g.name_ko, g.logo_color, g.scope_note, g.is_pilot
     FROM user_follows f
     JOIN idol_groups g ON g.id = f.group_id
     WHERE f.user_id = $1
     ORDER BY g.slug`,
    [userId],
  );
  return r.rows.map(mapGroup);
}

export async function setFollows(userId: string, groupIds: string[]) {
  if (!Array.isArray(groupIds)) throw badRequest("groupIds 必须是数组");
  await withTransaction(async (client) => {
    await client.query("DELETE FROM user_follows WHERE user_id = $1", [userId]);
    for (const gid of groupIds) {
      await client.query(
        "INSERT INTO user_follows (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, gid],
      );
    }
  });
  await track("follow_set", { groupIds, n: groupIds.length }, userId);
  return getFollows(userId);
}
