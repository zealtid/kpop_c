import { query } from "./db.js";
import { createDraftTemplate, getTemplate } from "./admin.js";
import { AppError, badRequest, notFound } from "./errors.js";

export const TICKET_STATUSES = ["open", "in_progress", "done", "wontfix"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const CLOSED: readonly TicketStatus[] = ["done", "wontfix"];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type TicketRow = {
  id: string;
  user_id: string;
  body: string;
  status: TicketStatus;
  assignee_ops_id: string | null;
  linked_template_id: string | null;
  internal_note: string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  user_nickname: string;
  assignee_username: string | null;
  template_id: string | null;
  template_name: string | null;
  template_status: string | null;
  template_dedupe_key: string | null;
  template_version: string | null;
  template_is_deprecated: boolean | null;
};

const TICKET_SELECT = `
  SELECT
    mf.id, mf.user_id, mf.body, mf.status, mf.assignee_ops_id, mf.linked_template_id,
    mf.internal_note, mf.closed_at, mf.created_at, mf.updated_at,
    u.nickname AS user_nickname,
    ou.username AS assignee_username,
    t.id AS template_id, t.name AS template_name, t.status AS template_status,
    t.dedupe_key AS template_dedupe_key, t.version AS template_version,
    t.is_deprecated AS template_is_deprecated
  FROM missing_feedback mf
  JOIN users u ON u.id = mf.user_id
  LEFT JOIN ops_users ou ON ou.id = mf.assignee_ops_id
  LEFT JOIN templates t ON t.id = mf.linked_template_id
`;

function mapTicket(row: TicketRow) {
  return {
    id: row.id,
    status: row.status,
    body: row.body,
    internalNote: row.internal_note,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    closedAt: iso(row.closed_at),
    user: { id: row.user_id, nickname: row.user_nickname },
    assignee: row.assignee_ops_id
      ? { id: row.assignee_ops_id, username: row.assignee_username || "" }
      : null,
    linkedTemplate: row.template_id
      ? {
          id: row.template_id,
          name: row.template_name,
          status: row.template_is_deprecated ? "deprecated" : row.template_status,
          version: row.template_version,
          dedupeKey: row.template_dedupe_key,
        }
      : null,
  };
}

export type Ticket = ReturnType<typeof mapTicket>;

function assertTransition(from: TicketStatus, to: TicketStatus) {
  if (from === to) return;
  if (CLOSED.includes(from) && to !== "open") {
    throw new AppError(400, "INVALID_TRANSITION", `已关闭工单只能重开为 open（当前 ${from}）`);
  }
  if (from === "open" && to !== "in_progress" && to !== "done" && to !== "wontfix") {
    throw new AppError(400, "INVALID_TRANSITION", `open 只能转到 in_progress / done / wontfix`);
  }
  if (from === "in_progress" && to !== "open" && to !== "done" && to !== "wontfix") {
    throw new AppError(400, "INVALID_TRANSITION", `in_progress 只能转到 open / done / wontfix`);
  }
}

async function loadTicketRow(id: string): Promise<TicketRow> {
  const r = await query<TicketRow>(`${TICKET_SELECT} WHERE mf.id = $1`, [id]);
  if (!r.rows[0]) throw notFound("工单不存在");
  return r.rows[0];
}

export async function listTickets(opts?: { status?: string; limit?: number; offset?: number }) {
  const status = opts?.status ? String(opts.status) : "";
  if (status && !isTicketStatus(status)) {
    throw badRequest("status 必须是 open | in_progress | done | wontfix");
  }
  const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 50));
  const offset = Math.max(0, Number(opts?.offset) || 0);
  const params: unknown[] = [];
  const where = status ? "WHERE mf.status = $1" : "";
  if (status) params.push(status);
  const count = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM missing_feedback mf ${where}`,
    params,
  );
  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;
  const r = await query<TicketRow>(
    `${TICKET_SELECT} ${where}
     ORDER BY mf.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return { tickets: r.rows.map(mapTicket), total: Number(count.rows[0]?.n || 0) };
}

export async function getTicket(id: string) {
  return mapTicket(await loadTicketRow(id));
}

async function assertOpsUser(id: string) {
  const r = await query("SELECT id FROM ops_users WHERE id = $1", [id]);
  if (!r.rows[0]) throw notFound("运营账号不存在");
}

export async function updateTicket(
  id: string,
  body: {
    status?: unknown;
    assigneeOpsId?: string | null;
    internalNote?: string | null;
  },
  actor?: { id?: string | null },
) {
  const current = await loadTicketRow(id);
  const from = current.status;
  let to = from;
  if (body.status !== undefined) {
    if (!isTicketStatus(body.status)) {
      throw badRequest("status 必须是 open | in_progress | done | wontfix");
    }
    to = body.status;
    assertTransition(from, to);
  }

  let note = current.internal_note;
  if (body.internalNote !== undefined) {
    const trimmed = body.internalNote == null ? "" : String(body.internalNote).trim();
    note = trimmed || null;
  }
  if (CLOSED.includes(to) && from !== to) {
    const closing = body.internalNote == null ? "" : String(body.internalNote).trim();
    if (!closing) throw badRequest("关闭工单需填写内部备注");
    note = closing;
  }

  let assignee = current.assignee_ops_id;
  if (body.assigneeOpsId !== undefined) {
    if (body.assigneeOpsId === null || body.assigneeOpsId === "") {
      assignee = null;
    } else {
      await assertOpsUser(String(body.assigneeOpsId));
      assignee = String(body.assigneeOpsId);
    }
  } else if (to === "in_progress" && from !== "in_progress" && !assignee && actor?.id) {
    assignee = actor.id;
  }

  const closedAt = CLOSED.includes(to) ? (from === to ? current.closed_at : new Date()) : null;

  await query(
    `UPDATE missing_feedback
     SET status = $2, assignee_ops_id = $3, internal_note = $4, closed_at = $5, updated_at = now()
     WHERE id = $1`,
    [id, to, assignee, note, closedAt],
  );
  return getTicket(id);
}

export async function linkTicketTemplate(id: string, templateId: string | null) {
  await loadTicketRow(id);
  if (templateId) {
    const t = await query("SELECT id FROM templates WHERE id = $1", [templateId]);
    if (!t.rows[0]) throw notFound("模板不存在");
  }
  await query(
    `UPDATE missing_feedback SET linked_template_id = $2, updated_at = now() WHERE id = $1`,
    [id, templateId],
  );
  return getTicket(id);
}

export async function createDraftAndLink(
  id: string,
  body: {
    releaseId: string;
    memberId?: string;
    version: string;
    name?: string;
    isBenefit?: boolean;
    mainImageUrl?: string | null;
    code?: string;
    status?: string;
  },
) {
  await loadTicketRow(id);
  if (body.status && body.status !== "draft") {
    throw badRequest("工单关联的新模板只能是 draft，不能直接入库");
  }
  const created = await createDraftTemplate(body);
  await query(
    `UPDATE missing_feedback SET linked_template_id = $2, updated_at = now() WHERE id = $1`,
    [id, created.id],
  );
  return { ticket: await getTicket(id), template: await getTemplate(created.id) };
}
