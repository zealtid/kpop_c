import { api, errorMessage } from "../api";

export type Submission = {
  id: string;
  userId: string;
  groupId: string;
  groupNameZh?: string | null;
  releaseId?: string | null;
  releaseTitle?: string | null;
  memberId?: string | null;
  memberNameEn?: string | null;
  versionLabel?: string | null;
  slotLabel: string;
  channelCode?: string | null;
  imageFront: string;
  imageBack?: string | null;
  imageFrontThumb?: string | null;
  status: string;
  rejectReason?: string | null;
  source: string;
  duplicateOfTemplateId?: string | null;
  duplicateCandidates?: { id: string; name: string; version: string }[];
  resultTemplateId?: string | null;
  createdAt?: string | null;
};

function denied(status: number, body: unknown) {
  return errorMessage(body, status === 403 ? "没有权限访问运营接口" : "请求失败");
}

export async function listSubmissions(opts?: { status?: string; groupId?: string; releaseId?: string }) {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.groupId) qs.set("groupId", opts.groupId);
  if (opts?.releaseId) qs.set("releaseId", opts.releaseId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await api<{ submissions: Submission[] }>(`/admin/catalog-submissions${suffix}`);
  if (res.status !== 200) {
    return { ok: false as const, status: res.status, message: denied(res.status, res.body), submissions: [] as Submission[] };
  }
  return { ok: true as const, submissions: res.body.submissions || [] };
}

export async function getSubmission(id: string) {
  return api<Submission>(`/admin/catalog-submissions/${id}`);
}

export async function approveSubmission(
  id: string,
  body: {
    releaseId?: string;
    memberId?: string | null;
    versionLabel?: string;
    slotLabel?: string;
    mergeTemplateId?: string | null;
    adoptSubmissionImage?: boolean;
  },
) {
  return api<Submission>(`/admin/catalog-submissions/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rejectSubmission(id: string, reason: string) {
  return api<Submission>(`/admin/catalog-submissions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function unpublishTemplate(id: string) {
  return api(`/admin/templates/${id}/unpublish`, { method: "POST" });
}
