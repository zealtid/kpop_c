import { api, errorMessage } from "../api";
import type { Ticket, TicketStatus } from "./types";

export type TicketListResult =
  | { ok: true; tickets: Ticket[]; total: number }
  | { ok: false; status: number; message: string };

export async function listTickets(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<TicketListResult> {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  if (opts?.offset != null) qs.set("offset", String(opts.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await api<{ tickets: Ticket[]; total: number }>(`/admin/tickets${suffix}`);
  if (res.status !== 200) {
    return {
      ok: false,
      status: res.status,
      message: errorMessage(res.body, res.status === 403 ? "没有权限访问运营接口" : "请求失败"),
    };
  }
  return { ok: true, tickets: res.body.tickets || [], total: res.body.total || 0 };
}

export async function getTicket(id: string) {
  return api<Ticket>(`/admin/tickets/${id}`);
}

export type TicketPatchBody = {
  status?: TicketStatus;
  assigneeOpsId?: string | null;
  internalNote?: string | null;
};

/** PATCH /admin/tickets/:id — 现网字段仅 status / assigneeOpsId / internalNote */
export async function updateTicket(id: string, body: TicketPatchBody) {
  return api<Ticket>(`/admin/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** 有 templateId 则关联已有模板，不改图鉴状态 */
export async function linkTicketTemplate(id: string, templateId: string) {
  return api<Ticket>(`/admin/tickets/${id}/templates`, {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

export type CreateDraftBody = {
  releaseId: string;
  memberId?: string;
  version: string;
  name?: string;
  isBenefit?: boolean;
};

/**
 * 无 templateId 时按 body 建 draft 并关联。
 * 故意不传 status：后端拒绝非 draft，本页也不绕过无图发布门禁。
 */
export async function createDraftAndLink(id: string, body: CreateDraftBody) {
  return api<{ ticket: Ticket; template: { id: string; status: string; version: string } }>(
    `/admin/tickets/${id}/templates`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
