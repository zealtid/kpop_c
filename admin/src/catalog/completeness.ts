import { api, errorMessage } from "../api";

export type PublishGate = {
  status: string;
  canPublish: boolean;
  blockers: { code: string; message: string }[];
  signOff: null;
  signOffNote: string;
};

export type CompletenessRelease = {
  id: string;
  title: string;
  titleZh?: string | null;
  kind: string;
  status: string;
  releasedOn?: string | null;
  draftCount: number;
  publishedCount: number;
  deprecatedCount: number;
  missingMainImage: number;
  missingMembers: { id: string; nameEn: string; nameZh: string | null }[];
  inAllowedSlice: boolean | null;
  publishGate: PublishGate;
};

export type CompletenessGroup = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  status: string;
  draftCount: number;
  publishedCount: number;
  deprecatedCount: number;
  missingMainImage: number;
  missingMembers: number;
  constraint: { configured: boolean; allowedReleaseIds: string[] };
  expansionGate: PublishGate;
  releases: CompletenessRelease[];
};

export type CompletenessLoadResult =
  | { ok: true; groups: CompletenessGroup[] }
  | { ok: false; status: number; message: string };

export async function loadCompleteness(): Promise<CompletenessLoadResult> {
  const res = await api<{ groups: CompletenessGroup[] }>("/admin/completeness");
  if (res.status !== 200) {
    const denied = res.status === 403;
    return {
      ok: false,
      status: res.status,
      message: errorMessage(res.body, denied ? "没有权限访问运营接口" : "请求失败"),
    };
  }
  return { ok: true, groups: res.body.groups || [] };
}

export function gateLabel(status: string) {
  if (status === "blocked") return "发布闸门 · 拦截";
  if (status === "incomplete") return "发布闸门 · 不完整";
  if (status === "ready") return "发布闸门 · 可发";
  if (status === "published") return "已发布";
  if (status === "open") return "开放";
  return status;
}

export function gateTagType(status: string): "error" | "warning" | "success" | "info" | "default" {
  if (status === "blocked") return "error";
  if (status === "incomplete") return "warning";
  if (status === "ready" || status === "published") return "success";
  if (status === "open") return "info";
  return "default";
}

export function sliceLabel(inAllowedSlice: boolean | null) {
  if (inAllowedSlice == null) return "未配置";
  return inAllowedSlice ? "切片内" : "切片外";
}
