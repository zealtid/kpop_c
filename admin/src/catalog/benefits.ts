import { api, errorMessage } from "../api";

export type BenefitIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type BenefitReport = {
  ok: boolean;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: BenefitIssue[];
};

export type BenefitMapRow = {
  id: string;
  groupSlug: string;
  releaseId: string;
  releaseTitle: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
  mapsToSlotLabels: string | null;
  mapMode: string;
  evidenceUrl: string | null;
  status: string;
  groupId?: string;
  tagsHint?: string | null;
};

export type BenefitChannel = {
  code: string;
  name_zh: string;
  aliases: string[];
  enabled?: boolean;
  sortOrder?: number;
};

export type BenefitValidateResponse = {
  committed?: boolean;
  written?: number;
  report?: BenefitReport;
  maps?: BenefitMapRow[];
  error?: { message?: string; details?: BenefitReport };
};

export const BENEFIT_CSV_PLACEHOLDER = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status,benefit_batch,benefit_type,tags_hint
bts,bts-arirang,standard,weverse,预购特典 Weverse,预购特典 Weverse,slots,https://example.invalid/weverse-arirang-pob,confirmed,1.0,pob,"特典,预购"`;

export async function listBenefitChannels() {
  return api<{ channels: BenefitChannel[] }>("/admin/version-benefit/channels");
}

export async function listBenefitMaps(opts: { releaseId?: string; groupId?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.releaseId) qs.set("releaseId", opts.releaseId);
  if (opts.groupId) qs.set("groupId", opts.groupId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<{ maps: BenefitMapRow[] }>(`/admin/version-benefit/maps${suffix}`);
}

export async function validateBenefits(text: string, tagsStrict: boolean) {
  return api<BenefitValidateResponse>("/admin/version-benefit/validate", {
    method: "POST",
    body: JSON.stringify({ text, tagsStrict }),
  });
}

export async function importBenefits(text: string, tagsStrict: boolean) {
  return api<BenefitValidateResponse>("/admin/version-benefit/import", {
    method: "POST",
    body: JSON.stringify({ text, tagsStrict }),
  });
}

export async function saveBenefitChannel(editingCode: string | null, body: Record<string, unknown>) {
  if (editingCode) {
    return api<BenefitChannel>(`/admin/version-benefit/channels/${encodeURIComponent(editingCode)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  return api<BenefitChannel>("/admin/version-benefit/channels", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function disableBenefitChannel(code: string) {
  return api<BenefitChannel>(`/admin/version-benefit/channels/${encodeURIComponent(code)}/disable`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type BenefitMapPayload = Record<string, unknown>;

export async function saveBenefitMap(editingId: string | null, body: BenefitMapPayload) {
  if (editingId) {
    return api<{ map: BenefitMapRow }>(`/admin/version-benefit/maps/${editingId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  return api<{ map: BenefitMapRow }>("/admin/version-benefit/maps", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function retireBenefitMap(id: string) {
  return api<{ map: BenefitMapRow }>(`/admin/version-benefit/maps/${id}/retire`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deleteBenefitMap(id: string) {
  return api<{ deleted: boolean }>(`/admin/version-benefit/maps/${id}`, { method: "DELETE" });
}

/** 4xx 时报告在 error.details；成功时在 report。 */
export function benefitReportFrom(res: { status: number; body: BenefitValidateResponse }): BenefitReport | null {
  if (res.body.report) return res.body.report;
  return res.body.error?.details || null;
}

export function benefitNotice(res: { status: number; body: BenefitValidateResponse }, fallback: string) {
  return errorMessage(res.body, fallback);
}
