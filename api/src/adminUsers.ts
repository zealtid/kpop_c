import { query, withTransaction } from "./db.js";
import { badRequest, notFound, rateLimited } from "./errors.js";
import { pointsPerApprovedCard } from "./contributionPoints.js";
import { adminList } from "./catalogSubmissions.js";
import { writeAuditLog, type AuditActor } from "./audit.js";
import { looksLikePhoneQuery, maskPhone, toE164 } from "./phone.js";
import { enqueueObjectGc, kickObjectGc } from "./objectGc.js";

function iso(value: unknown) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

type FollowedGroup = { id: string; slug: string; nameZh: string };

function parseFollowed(raw: unknown): FollowedGroup[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((g) => ({
      id: String((g as { id?: unknown }).id || ""),
      slug: String((g as { slug?: unknown }).slug || ""),
      nameZh: String((g as { nameZh?: unknown }).nameZh || (g as { name_zh?: unknown }).name_zh || ""),
    }))
    .filter((g) => g.id);
}

type UserListRow = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  privacy: string;
  created_at: Date | string;
  updated_at: Date | string;
  contribution_points: number | string;
  phone_e164: string | null;
  phone_masked: string | null;
  phone_bound_at: Date | string | null;
  followed_groups: unknown;
  submission_count: number | string;
  pending_count: number | string;
  approved_count: number | string;
  rejected_count: number | string;
};

function mapAdminUser(row: UserListRow, extra?: { phoneE164?: string | null }) {
  return {
    id: String(row.id),
    nickname: String(row.nickname || ""),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    privacy: String(row.privacy || "private"),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    contributionPoints: Number(row.contribution_points) || 0,
    phoneMasked: row.phone_masked || (row.phone_e164 ? maskPhone(String(row.phone_e164)) : null),
    phoneBound: !!(row.phone_e164 || row.phone_masked),
    phoneBoundAt: iso(row.phone_bound_at),
    followedGroups: parseFollowed(row.followed_groups),
    submissionCount: Number(row.submission_count) || 0,
    pendingCount: Number(row.pending_count) || 0,
    approvedCount: Number(row.approved_count) || 0,
    rejectedCount: Number(row.rejected_count) || 0,
    ...(extra?.phoneE164 ? { phoneE164: extra.phoneE164 } : {}),
  };
}

const USER_SELECT = `
  SELECT
    u.id, u.nickname, u.avatar_url, u.privacy, u.created_at, u.updated_at, u.contribution_points,
    u.phone_e164, u.phone_masked, u.phone_bound_at,
    COALESCE((
      SELECT json_agg(json_build_object('id', g.id, 'slug', g.slug, 'nameZh', g.name_zh) ORDER BY g.slug)
      FROM user_follows f
      JOIN idol_groups g ON g.id = f.group_id
      WHERE f.user_id = u.id
    ), '[]'::json) AS followed_groups,
    (SELECT COUNT(*)::int FROM catalog_submissions s WHERE s.user_id = u.id) AS submission_count,
    (SELECT COUNT(*)::int FROM catalog_submissions s WHERE s.user_id = u.id AND s.status = 'pending_review') AS pending_count,
    (SELECT COUNT(*)::int FROM catalog_submissions s WHERE s.user_id = u.id AND s.status = 'approved') AS approved_count,
    (SELECT COUNT(*)::int FROM catalog_submissions s WHERE s.user_id = u.id AND s.status = 'rejected') AS rejected_count
  FROM users u
`;

const PHONE_SEARCH_LIMIT = 20;
const PHONE_SEARCH_WINDOW_MS = 60_000;
const phoneSearchHits = new Map<string, number[]>();

export function resetPhoneSearchRateLimitForTests() {
  phoneSearchHits.clear();
}

function assertPhoneSearchRate(actorKey: string) {
  const key = String(actorKey || "ops").trim() || "ops";
  const now = Date.now();
  const windowStart = now - PHONE_SEARCH_WINDOW_MS;
  const hits = (phoneSearchHits.get(key) || []).filter((t) => t > windowStart);
  if (hits.length >= PHONE_SEARCH_LIMIT) {
    throw rateLimited("手机号查询过于频繁，请稍后再试", "PHONE_SEARCH_RATE_LIMIT");
  }
  hits.push(now);
  phoneSearchHits.set(key, hits);
}

function searchWhere(q: string, params: unknown[], actorKey?: string) {
  const term = q.trim();
  if (!term) return "";
  if (isUuid(term)) {
    params.push(term);
    return `WHERE u.id = $${params.length}::uuid`;
  }
  if (looksLikePhoneQuery(term)) {
    assertPhoneSearchRate(actorKey || "ops");
    const e164 = toE164(term);
    params.push(e164);
    return `WHERE u.phone_e164 = $${params.length}`;
  }
  params.push(`%${term}%`);
  return `WHERE u.nickname ILIKE $${params.length}`;
}

export async function listAdminUsers(opts?: {
  q?: string;
  limit?: number;
  offset?: number;
  actorKey?: string;
}) {
  const q = String(opts?.q || "");
  const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 20));
  const offset = Math.max(0, Number(opts?.offset) || 0);
  const params: unknown[] = [];
  const where = searchWhere(q, params, opts?.actorKey);
  const count = await query<{ n: string }>(`SELECT count(*)::text AS n FROM users u ${where}`, params);
  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;
  const r = await query<UserListRow>(
    `${USER_SELECT} ${where}
     ORDER BY u.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return {
    users: r.rows.map((row) => mapAdminUser(row)),
    total: Number(count.rows[0]?.n || 0),
    pointsPerApprovedCard: pointsPerApprovedCard(),
  };
}

export async function getAdminUser(id: string) {
  const raw = String(id || "").trim();
  if (!raw || !isUuid(raw)) throw notFound("用户不存在");
  const r = await query<UserListRow>(`${USER_SELECT} WHERE u.id = $1`, [raw]);
  if (!r.rows[0]) throw notFound("用户不存在");
  return {
    ...mapAdminUser(r.rows[0]),
    pointsPerApprovedCard: pointsPerApprovedCard(),
  };
}

export async function revealAdminUserPhone(
  id: string,
  actor: AuditActor | null | undefined,
  extra?: { ip?: string | null; ua?: string | null },
) {
  const raw = String(id || "").trim();
  if (!raw || !isUuid(raw)) throw notFound("用户不存在");
  const r = await query<{ phone_e164: string | null; phone_masked: string | null; nickname: string }>(
    "SELECT phone_e164, phone_masked, nickname FROM users WHERE id = $1",
    [raw],
  );
  if (!r.rows[0]) throw notFound("用户不存在");
  const phoneE164 = r.rows[0].phone_e164 || null;
  const phoneMasked = r.rows[0].phone_masked || (phoneE164 ? maskPhone(phoneE164) : null);
  await writeAuditLog({
    actor,
    action: "user.reveal_phone",
    entityType: "user",
    entityId: raw,
    payload: {
      phoneMasked,
      nickname: r.rows[0].nickname,
      ip: extra?.ip || undefined,
      ua: extra?.ua || undefined,
    },
  });
  return { id: raw, phoneE164, phoneMasked };
}

export async function listAdminUserSubmissions(userId: string) {
  await getAdminUser(userId);
  return adminList({ userId });
}

function confirmMatches(user: { id: string; nickname: string }, confirmRaw: unknown) {
  const confirm = String(confirmRaw ?? "").trim();
  if (!confirm) return false;
  if (confirm.toLowerCase() === String(user.id).toLowerCase()) return true;
  return confirm === String(user.nickname || "").trim();
}

export async function hardDeleteAdminUser(
  id: string,
  confirmRaw: unknown,
  actor: AuditActor | null | undefined,
  extra?: { ip?: string | null; ua?: string | null },
) {
  const raw = String(id || "").trim();
  if (!raw || !isUuid(raw)) throw notFound("用户不存在");
  const confirm = String(confirmRaw ?? "").trim();
  if (!confirm) {
    throw badRequest("请输入昵称或用户 ID 以确认删除");
  }

  const user = await query<{
    id: string;
    nickname: string;
    wx_openid: string;
    wx_unionid: string | null;
    phone_masked: string | null;
    avatar_url: string | null;
  }>(
    "SELECT id, nickname, wx_openid, wx_unionid, phone_masked, avatar_url FROM users WHERE id = $1",
    [raw],
  );
  if (!user.rows[0]) throw notFound("用户不存在");
  const row = user.rows[0];
  if (!confirmMatches({ id: row.id, nickname: row.nickname }, confirm)) {
    throw badRequest("确认词不匹配，请输入该用户昵称或 ID");
  }

  const result = await withTransaction(async (client) => {
    const q = <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      client.query<T>(text, params);

    const userCards = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM user_cards WHERE user_id = $1", [raw])).rows[0]?.n || 0,
    );
    const userWants = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM user_wants WHERE user_id = $1", [raw])).rows[0]?.n || 0,
    );
    const userFollows = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM user_follows WHERE user_id = $1", [raw])).rows[0]?.n || 0,
    );
    const customCards = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM user_custom_cards WHERE user_id = $1", [raw])).rows[0]
        ?.n || 0,
    );
    const submissions = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM catalog_submissions WHERE user_id = $1", [raw])).rows[0]
        ?.n || 0,
    );
    const pointEvents = Number(
      (
        await q<{ n: string }>("SELECT count(*)::text AS n FROM contribution_point_events WHERE user_id = $1", [raw])
      ).rows[0]?.n || 0,
    );
    const shares = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM share_images WHERE user_id = $1", [raw])).rows[0]?.n || 0,
    );
    const tickets = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM missing_feedback WHERE user_id = $1", [raw])).rows[0]
        ?.n || 0,
    );
    const l2 = Number(
      (await q<{ n: string }>("SELECT count(*)::text AS n FROM feed_l2_whitelist WHERE user_id = $1", [raw])).rows[0]
        ?.n || 0,
    );

    const kept = await q<{ id: string; status: string }>(
      `SELECT t.id, t.status
       FROM templates t
       JOIN catalog_submissions s ON s.result_template_id = t.id
       WHERE s.user_id = $1 AND t.source = 'user_submission'`,
      [raw],
    );
    const catalogKeptIds = [...new Set(kept.rows.map((t) => String(t.id)))];
    const catalogKeptPublished = kept.rows.filter((t) => String(t.status) === "published").length;

    const customMedia = await q<{ image_front: string; image_back: string | null }>(
      "SELECT image_front, image_back FROM user_custom_cards WHERE user_id = $1",
      [raw],
    );
    const subMedia = await q<{
      image_front: string;
      image_back: string | null;
      image_front_thumb: string | null;
      image_back_thumb: string | null;
    }>(
      "SELECT image_front, image_back, image_front_thumb, image_back_thumb FROM catalog_submissions WHERE user_id = $1",
      [raw],
    );
    const shareMedia = await q<{ file_path: string; public_url: string }>(
      "SELECT file_path, public_url FROM share_images WHERE user_id = $1",
      [raw],
    );

    const gcPaths: Array<string | null | undefined> = [row.avatar_url];
    for (const c of customMedia.rows) {
      gcPaths.push(c.image_front, c.image_back);
    }
    for (const s of subMedia.rows) {
      gcPaths.push(s.image_front, s.image_back, s.image_front_thumb, s.image_back_thumb);
    }
    for (const s of shareMedia.rows) {
      gcPaths.push(s.file_path);
      try {
        const url = new URL(s.public_url);
        gcPaths.push(url.pathname);
      } catch {
        if (s.public_url?.startsWith("/media/")) gcPaths.push(s.public_url);
      }
    }

    const queuedGc = await enqueueObjectGc({
      paths: gcPaths.filter((p): p is string => typeof p === "string"),
      reason: "user_hard_delete",
      userId: raw,
      exec: (text, params) => client.query(text, params),
    });

    const vlmDaily = await q(
      "DELETE FROM grid_vlm_daily WHERE user_id = $1 RETURNING user_id",
      [raw],
    );
    const vlmCalls = await q(
      "DELETE FROM grid_vlm_calls WHERE user_id = $1 RETURNING id",
      [raw],
    );

    await q("UPDATE phone_bind_events SET user_id = NULL WHERE user_id = $1", [raw]);

    await q("DELETE FROM users WHERE id = $1", [raw]);

    const openIdDigest = String(row.wx_openid || "").slice(0, 8);
    const summary = {
      users: 1,
      user_cards: userCards,
      user_wants: userWants,
      user_follows: userFollows,
      user_custom_cards: customCards,
      catalog_submissions: submissions,
      contribution_point_events: pointEvents,
      share_images: shares,
      missing_feedback: tickets,
      feed_l2_whitelist: l2,
      analytics_events: "set_null",
      grid_vlm_daily: vlmDaily.rowCount || 0,
      grid_vlm_calls: vlmCalls.rowCount || 0,
      catalog_kept: catalogKeptPublished,
      catalog_kept_total: catalogKeptIds.length,
      catalog_kept_ids: catalogKeptIds.slice(0, 20),
      queued_gc: queuedGc,
      phone_bind_events: "anonymized",
      sessions: "jwt_invalid_after_user_row_gone",
    };

    await writeAuditLog(
      {
        actor,
        action: "user.hard_delete",
        entityType: "user",
        entityId: raw,
        payload: {
          targetUserId: raw,
          nickname: row.nickname,
          openIdDigest,
          phoneMasked: row.phone_masked,
          catalog_kept: catalogKeptPublished,
          queued_gc: queuedGc,
          cleanup: summary,
          ip: extra?.ip || undefined,
          ua: extra?.ua || undefined,
        },
      },
      (text, params) => client.query(text, params),
    );

    return {
      deleted: true,
      targetUserId: raw,
      nickname: row.nickname,
      cleanup: summary,
    };
  });

  kickObjectGc();
  return result;
}
