import { api, errorMessage } from "../api";

export type FollowedGroup = {
  id: string;
  slug: string;
  nameZh: string;
};

export type AdminUser = {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  privacy: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  contributionPoints: number;
  followedGroups: FollowedGroup[];
  submissionCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  pointsPerApprovedCard?: number;
};

function denied(status: number, body: unknown) {
  return errorMessage(body, status === 403 ? "没有权限访问运营接口" : "请求失败");
}

export async function listUsers(opts?: { q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (opts?.q) qs.set("q", opts.q);
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.offset != null) qs.set("offset", String(opts.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await api<{ users: AdminUser[]; total: number; pointsPerApprovedCard?: number }>(
    `/admin/users${suffix}`,
  );
  if (res.status !== 200) {
    return {
      ok: false as const,
      status: res.status,
      message: denied(res.status, res.body),
      users: [] as AdminUser[],
      total: 0,
    };
  }
  return {
    ok: true as const,
    users: res.body.users || [],
    total: res.body.total || 0,
    pointsPerApprovedCard: res.body.pointsPerApprovedCard ?? 1,
  };
}

export async function getUser(id: string) {
  return api<AdminUser>(`/admin/users/${id}`);
}

export function formatUserTime(iso: string | null | undefined) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

export function followLabel(groups: FollowedGroup[] | undefined) {
  if (!groups?.length) return "—";
  return groups.map((g) => g.nameZh || g.slug).join("、");
}
