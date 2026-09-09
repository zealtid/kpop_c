import { query, withTransaction } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import { getGroup, mapGroup } from "./catalog.js";
import type { PoolClient } from "pg";

export const GUEST_FEED_LIMIT = Math.min(
  20,
  Math.max(10, Number(process.env.GUEST_FEED_LIMIT || 12) || 12),
);

export const TRUST_LEVELS = ["L1", "L2", "L3"] as const;
export const FEED_STATUSES = ["draft", "published", "hidden"] as const;
export const FEED_CATEGORIES = ["official", "news", "album", "concert", "other"] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];
export type FeedStatus = (typeof FEED_STATUSES)[number];
export type FeedCategory = (typeof FEED_CATEGORIES)[number];

const FEED_SELECT = `
  SELECT f.id, f.title, f.summary, f.body, f.category, f.trust_level, f.canonical_url,
         f.published_at, f.is_machine_translated, f.source_note, f.status, f.featured,
         f.created_at, f.updated_at,
         COALESCE(ARRAY_AGG(fg.group_id ORDER BY fg.group_id) FILTER (WHERE fg.group_id IS NOT NULL), '{}') AS group_ids
  FROM feed_items f
  LEFT JOIN feed_item_groups fg ON fg.feed_item_id = f.id
`;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const v = String(value || "");
  if (!(allowed as readonly string[]).includes(v)) {
    throw badRequest(`${field} 必须是 ${allowed.join(" | ")}`);
  }
  return v as T;
}

export async function isL2Whitelisted(userId: string): Promise<boolean> {
  const r = await query("SELECT 1 FROM feed_l2_whitelist WHERE user_id = $1", [userId]);
  return !!r.rowCount;
}

export async function timelineTrustLevels(userId?: string | null): Promise<TrustLevel[]> {
  if (userId && (await isL2Whitelisted(userId))) return ["L1", "L2"];
  return ["L1"];
}

async function resolveGroupIds(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || ids.length === 0) throw badRequest("groupIds 不能为空");
  const resolved: string[] = [];
  for (const raw of ids) {
    const g = await getGroup(String(raw));
    resolved.push(g.id as string);
  }
  return [...new Set(resolved)];
}

async function replaceFeedGroups(client: PoolClient, feedId: string, groupIds: string[]) {
  await client.query("DELETE FROM feed_item_groups WHERE feed_item_id = $1", [feedId]);
  for (const gid of groupIds) {
    await client.query(
      "INSERT INTO feed_item_groups (feed_item_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [feedId, gid],
    );
  }
}

async function hydrateGroups(groupIds: string[]) {
  if (!groupIds.length) return [];
  const r = await query(
    `SELECT id, slug, name_zh, name_en, name_ko, logo_color, scope_note, is_pilot
     FROM idol_groups WHERE id = ANY($1::uuid[]) ORDER BY slug`,
    [groupIds],
  );
  return r.rows.map(mapGroup);
}

export async function mapFeedItem(row: Record<string, unknown>) {
  const groupIds = (row.group_ids as string[]) || [];
  const groups = await hydrateGroups(groupIds);
  const canonicalUrl = (row.canonical_url as string | null) || null;
  const sourceNote = (row.source_note as string | null) || null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    trustLevel: row.trust_level,
    canonicalUrl,
    url: canonicalUrl,
    publishedAt: row.published_at,
    isMachineTranslated: !!row.is_machine_translated,
    sourceNote,
    source: sourceNote,
    status: row.status,
    featured: !!row.featured,
    groupIds,
    groups,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadFeed(id: string, client?: PoolClient) {
  const q = client
    ? client.query.bind(client)
    : (sql: string, params?: unknown[]) => query(sql, params);
  const r = await q(`${FEED_SELECT} WHERE f.id = $1 GROUP BY f.id`, [id]);
  if (!r.rows[0]) throw notFound("情报不存在");
  return mapFeedItem(r.rows[0]);
}

export type FeedWriteBody = {
  title?: string;
  summary?: string | null;
  body?: string | null;
  category?: string;
  trustLevel?: string;
  canonicalUrl?: string | null;
  publishedAt?: string | null;
  isMachineTranslated?: boolean;
  sourceNote?: string | null;
  status?: string;
  featured?: boolean;
  groupIds?: unknown;
};

export async function createFeed(body: FeedWriteBody) {
  const title = String(body.title || "").trim();
  if (!title) throw badRequest("title 不能为空");
  const groupIds = await resolveGroupIds(body.groupIds);
  const status = body.status ? oneOf(body.status, FEED_STATUSES, "status") : "draft";
  const trustLevel = body.trustLevel ? oneOf(body.trustLevel, TRUST_LEVELS, "trustLevel") : "L1";
  const category = body.category ? oneOf(body.category, FEED_CATEGORIES, "category") : "official";
  const publishedAt =
    body.publishedAt != null && body.publishedAt !== ""
      ? new Date(body.publishedAt)
      : status === "published"
        ? new Date()
        : null;
  if (publishedAt && Number.isNaN(publishedAt.getTime())) throw badRequest("publishedAt 无效");

  const id = await withTransaction(async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO feed_items
         (title, summary, body, category, trust_level, canonical_url, published_at,
          is_machine_translated, source_note, status, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        title,
        body.summary ?? null,
        body.body ?? null,
        category,
        trustLevel,
        body.canonicalUrl ?? null,
        publishedAt,
        !!body.isMachineTranslated,
        body.sourceNote ?? null,
        status,
        !!body.featured,
      ],
    );
    const feedId = r.rows[0].id;
    await replaceFeedGroups(client, feedId, groupIds);
    return feedId;
  });
  return loadFeed(id);
}

export async function updateFeed(id: string, body: FeedWriteBody) {
  const existing = await query("SELECT id FROM feed_items WHERE id = $1", [id]);
  if (!existing.rows[0]) throw notFound("情报不存在");

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    sets.push(sql.replace("?", `$${params.length}`));
  };

  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) throw badRequest("title 不能为空");
    add("title = ?", title);
  }
  if (body.summary !== undefined) add("summary = ?", body.summary);
  if (body.body !== undefined) add("body = ?", body.body);
  if (body.category !== undefined) add("category = ?", oneOf(body.category, FEED_CATEGORIES, "category"));
  if (body.trustLevel !== undefined) {
    add("trust_level = ?", oneOf(body.trustLevel, TRUST_LEVELS, "trustLevel"));
  }
  if (body.canonicalUrl !== undefined) add("canonical_url = ?", body.canonicalUrl);
  if (body.publishedAt !== undefined) {
    const publishedAt =
      body.publishedAt == null || body.publishedAt === "" ? null : new Date(body.publishedAt);
    if (publishedAt && Number.isNaN(publishedAt.getTime())) throw badRequest("publishedAt 无效");
    add("published_at = ?", publishedAt);
  }
  if (body.isMachineTranslated !== undefined) add("is_machine_translated = ?", !!body.isMachineTranslated);
  if (body.sourceNote !== undefined) add("source_note = ?", body.sourceNote);
  if (body.status !== undefined) {
    const status = oneOf(body.status, FEED_STATUSES, "status");
    add("status = ?", status);
    if (status === "published") {
      params.push(new Date());
      sets.push(`published_at = COALESCE(published_at, $${params.length})`);
    }
  }
  if (body.featured !== undefined) add("featured = ?", !!body.featured);

  await withTransaction(async (client) => {
    if (sets.length > 1) {
      params.push(id);
      await client.query(`UPDATE feed_items SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    }
    if (body.groupIds !== undefined) {
      const groupIds = await resolveGroupIds(body.groupIds);
      await replaceFeedGroups(client, id, groupIds);
    }
  });
  return loadFeed(id);
}

export async function setFeedStatus(id: string, status: FeedStatus) {
  return updateFeed(id, { status });
}

export async function listAdminFeeds(opts: { status?: string; limit?: number } = {}) {
  const params: unknown[] = [];
  const conds = ["1=1"];
  if (opts.status) {
    params.push(oneOf(opts.status, FEED_STATUSES, "status"));
    conds.push(`f.status = $${params.length}`);
  }
  const limit = Math.min(200, Math.max(1, opts.limit || 100));
  params.push(limit);
  const r = await query(
    `${FEED_SELECT}
     WHERE ${conds.join(" AND ")}
     GROUP BY f.id
     ORDER BY f.updated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return Promise.all(r.rows.map(mapFeedItem));
}

export async function followedTimeline(userId: string, limit = 50) {
  const followed = await query("SELECT group_id FROM user_follows WHERE user_id = $1", [userId]);
  const groupIds = followed.rows.map((x) => x.group_id as string);
  const trust = await timelineTrustLevels(userId);
  const cap = Math.min(100, Math.max(1, limit));
  if (!groupIds.length) {
    return {
      items: [] as Awaited<ReturnType<typeof mapFeedItem>>[],
      timeline: "followed" as const,
      followedGroupIds: groupIds,
      trustFilter: trust,
      l2Enabled: trust.includes("L2"),
      l2Gated: true,
    };
  }
  const r = await query(
    `${FEED_SELECT}
     WHERE f.status = 'published'
       AND f.trust_level = ANY($1::text[])
       AND EXISTS (
         SELECT 1 FROM feed_item_groups x
         WHERE x.feed_item_id = f.id AND x.group_id = ANY($2::uuid[])
       )
     GROUP BY f.id
     ORDER BY f.published_at DESC NULLS LAST, f.created_at DESC
     LIMIT $3`,
    [trust, groupIds, cap],
  );
  return {
    items: await Promise.all(r.rows.map(mapFeedItem)),
    timeline: "followed" as const,
    followedGroupIds: groupIds,
    trustFilter: trust,
    l2Enabled: trust.includes("L2"),
    l2Gated: true,
  };
}

export async function guestFeatured(limit = GUEST_FEED_LIMIT) {
  const cap = Math.min(GUEST_FEED_LIMIT, Math.max(1, limit));
  const r = await query(
    `${FEED_SELECT}
     WHERE f.status = 'published' AND f.trust_level = 'L1' AND f.featured = true
     GROUP BY f.id
     ORDER BY f.published_at DESC NULLS LAST, f.created_at DESC
     LIMIT $1`,
    [cap],
  );
  return {
    items: await Promise.all(r.rows.map(mapFeedItem)),
    timeline: "featured" as const,
    guestLimit: GUEST_FEED_LIMIT,
    trustFilter: ["L1"] as TrustLevel[],
    l2Enabled: false,
    l2Gated: true,
  };
}

export async function getPublicFeed(id: string, userId?: string | null) {
  const item = await loadFeed(id);
  const trust = await timelineTrustLevels(userId);
  if (item.status !== "published" || !trust.includes(item.trustLevel as TrustLevel)) {
    throw notFound("情报不存在");
  }
  return item;
}

export async function addL2Whitelist(userId: string) {
  const u = await query("SELECT id FROM users WHERE id = $1", [userId]);
  if (!u.rows[0]) throw notFound("用户不存在");
  await query(
    "INSERT INTO feed_l2_whitelist (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [userId],
  );
  return { userId, l2Enabled: true };
}

export async function removeL2Whitelist(userId: string) {
  await query("DELETE FROM feed_l2_whitelist WHERE user_id = $1", [userId]);
  return { userId, l2Enabled: false };
}

export async function listL2Whitelist() {
  const r = await query("SELECT user_id, created_at FROM feed_l2_whitelist ORDER BY created_at");
  return r.rows.map((x) => ({ userId: x.user_id, createdAt: x.created_at }));
}
