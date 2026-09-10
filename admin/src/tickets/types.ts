export const TICKET_STATUSES = ["open", "in_progress", "done", "wontfix"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type Ticket = {
  id: string;
  status: TicketStatus;
  body: string;
  internalNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  user: { id: string; nickname: string };
  assignee: { id: string; username: string } | null;
  linkedTemplate: {
    id: string;
    name: string | null;
    status: string | null;
    version: string | null;
    dedupeKey: string | null;
  } | null;
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "待处理",
  in_progress: "处理中",
  done: "已完成",
  wontfix: "不修复",
};

export const TICKET_FILTERS: { id: "" | TicketStatus; label: string }[] = [
  { id: "", label: "全部" },
  { id: "open", label: "待处理" },
  { id: "in_progress", label: "处理中" },
  { id: "done", label: "已完成" },
  { id: "wontfix", label: "不修复" },
];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function parseTicketStatusFilter(raw: unknown): "" | TicketStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isTicketStatus(value) ? value : "";
}

export function ticketStatusLabel(status: string) {
  return isTicketStatus(status) ? TICKET_STATUS_LABEL[status] : status;
}

export function ticketStatusTagType(status: string): "warning" | "info" | "success" | "default" {
  if (status === "open") return "warning";
  if (status === "in_progress") return "info";
  if (status === "done") return "success";
  return "default";
}

export function isClosedTicket(status: string) {
  return status === "done" || status === "wontfix";
}

export function formatTicketTime(iso: string | null) {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 16);
}

export function ticketSnippet(body: string) {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 80)}…` : one;
}
