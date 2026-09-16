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
  phoneMasked?: string | null;
  phoneBound?: boolean;
  phoneBoundAt?: string | null;
  followedGroups: FollowedGroup[];
  submissionCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  pointsPerApprovedCard?: number;
};

export type PhoneBindEvent = {
  id: string;
  userId: string | null;
  actor: string;
  event: string;
  phoneMasked: string | null;
  errorCode: string | null;
  createdAt: string;
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

export async function listPhoneEvents(id: string) {
  return api<{ events: PhoneBindEvent[] }>(`/admin/users/${id}/phone-events`);
}

export async function revealPhone(id: string) {
  return api<{ id: string; phoneE164: string | null; phoneMasked: string | null }>(
    `/admin/users/${id}/reveal-phone`,
    { method: "POST", body: "{}" },
  );
}

export async function hardDeleteUser(id: string, confirm: string) {
  return api<{
    deleted: boolean;
    targetUserId: string;
    nickname: string;
    cleanup: Record<string, unknown>;
  }>(`/admin/users/${id}/hard-delete`, {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
}

export function formatUserTime(iso: string | null | undefined) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

export function followLabel(groups: FollowedGroup[] | undefined) {
  if (!groups?.length) return "—";
  return groups.map((g) => g.nameZh || g.slug).join("、");
}

export function bindEventLabel(event: string) {
  if (event === "bind_success") return "绑定成功";
  if (event === "rebind") return "换绑";
  if (event === "bind_fail") return "绑定失败";
  return event;
}
