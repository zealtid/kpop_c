import { query } from "./db.js";
import { notFound } from "./errors.js";
import { pointsPerApprovedCard } from "./contributionPoints.js";
import { adminList } from "./catalogSubmissions.js";

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
  followed_groups: unknown;
  submission_count: number | string;
  pending_count: number | string;
  approved_count: number | string;
  rejected_count: number | string;
};

function mapAdminUser(row: UserListRow) {
  return {
    id: String(row.id),
    nickname: String(row.nickname || ""),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    privacy: String(row.privacy || "private"),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    contributionPoints: Number(row.contribution_points) || 0,
    followedGroups: parseFollowed(row.followed_groups),
    submissionCount: Number(row.submission_count) || 0,
    pendingCount: Number(row.pending_count) || 0,
    approvedCount: Number(row.approved_count) || 0,
    rejectedCount: Number(row.rejected_count) || 0,
  };
}

const USER_SELECT = `
  SELECT
    u.id, u.nickname, u.avatar_url, u.privacy, u.created_at, u.updated_at, u.contribution_points,
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

function searchWhere(q: string, params: unknown[]) {
  const term = q.trim();
  if (!term) return "";
  params.push(term);
  const idx = params.length;
  if (isUuid(term)) {
    return `WHERE u.id = $${idx}::uuid`;
  }
  params[idx - 1] = `%${term}%`;
  return `WHERE u.nickname ILIKE $${idx}`;
}

export async function listAdminUsers(opts?: { q?: string; limit?: number; offset?: number }) {
  const q = String(opts?.q || "");
  const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 20));
  const offset = Math.max(0, Number(opts?.offset) || 0);
  const params: unknown[] = [];
  const where = searchWhere(q, params);
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
    users: r.rows.map(mapAdminUser),
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

export async function listAdminUserSubmissions(userId: string) {
  await getAdminUser(userId);
  return adminList({ userId });
}
