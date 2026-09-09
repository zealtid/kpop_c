import { escapeHtml, option, statusBadge } from "./html";

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

type Release = { id: string; title: string; groupNameZh?: string };
type Member = { id: string; nameEn: string; groupNameZh?: string };
type Template = {
  id: string;
  name: string;
  version: string;
  status: string;
  catalogStatus?: string;
  releaseTitle?: string;
  memberNameEn?: string | null;
  groupNameZh?: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "处理中",
  done: "已完成",
  wontfix: "不修复",
};

export function ticketStatusBadge(status: string) {
  return `<span class="badge ticket-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`;
}

function when(iso: string | null) {
  if (!iso) return "";
  return escapeHtml(iso.replace("T", " ").slice(0, 16));
}

function snippet(body: string) {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 80)}…` : one;
}

export function ticketsFilterNav(current: string) {
  const items = [
    { id: "", label: "全部" },
    { id: "open", label: "待处理" },
    { id: "in_progress", label: "处理中" },
    { id: "done", label: "已完成" },
    { id: "wontfix", label: "不修复" },
  ];
  return `<nav class="subnav">${items
    .map(
      (t) =>
        `<a href="#/tickets" data-ticket-filter="${escapeHtml(t.id)}" class="${current === t.id ? "active" : ""}">${t.label}</a>`,
    )
    .join(" ")}</nav>`;
}

export function ticketsListView(tickets: Ticket[], statusFilter: string, notice: string, total: number) {
  const rows = tickets
    .map(
      (t) => `
      <tr>
        <td>${when(t.createdAt)}</td>
        <td>${escapeHtml(t.user.nickname)}</td>
        <td><a href="#/tickets/${escapeHtml(t.id)}">${escapeHtml(snippet(t.body) || "（空）")}</a></td>
        <td>${ticketStatusBadge(t.status)}</td>
        <td>${t.linkedTemplate ? escapeHtml(t.linkedTemplate.name || t.linkedTemplate.id) : "—"}</td>
      </tr>`,
    )
    .join("");
  return `
    <section class="card">
      <h1>反馈 / 工单</h1>
      <p class="muted">消费小程序空搜（C03）提交的文字缺卡反馈。进度<strong>不</strong>回写 C 端。关联模板仅为草稿，无申请入库。</p>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="ticket-notice">${escapeHtml(notice)}</p>` : ""}
      ${ticketsFilterNav(statusFilter)}
      <p class="stats">${total} 条</p>
      ${
        tickets.length
          ? `<div class="table-wrap"><table><thead><tr><th>提交</th><th>用户</th><th>内容</th><th>状态</th><th>关联模板</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<p class="empty">暂无工单</p>`
      }
    </section>`;
}

export function ticketDetailView(
  ticket: Ticket,
  releases: Release[],
  members: Member[],
  templates: Template[],
  notice: string,
) {
  const relOpts = releases.map((r) => option(r.id, `${r.groupNameZh || ""} · ${r.title}`)).join("");
  const memOpts =
    option("", "（组合卡 / 无成员）") +
    members.map((m) => option(m.id, `${m.groupNameZh || ""} · ${m.nameEn}`)).join("");
  const tplOpts =
    option("", "选择已有模板") +
    templates
      .map((t) =>
        option(
          t.id,
          `${t.groupNameZh || ""} · ${t.releaseTitle || ""} · ${t.memberNameEn || "group"} · ${t.version} (${t.catalogStatus || t.status})`,
          ticket.linkedTemplate?.id,
        ),
      )
      .join("");
  const closed = ticket.status === "done" || ticket.status === "wontfix";
  const statusBtns = closed
    ? `<button class="btn small" type="button" data-ticket-status="open">重开</button>`
    : `
      ${ticket.status !== "in_progress" ? `<button class="btn small" type="button" data-ticket-status="in_progress">认领</button>` : `<button class="btn small ghost" type="button" data-ticket-status="open">放回待处理</button>`}
      <button class="btn small ok" type="button" data-ticket-status="done">完成</button>
      <button class="btn small danger" type="button" data-ticket-status="wontfix">不修复</button>`;
  const linked = ticket.linkedTemplate
    ? `<p>${escapeHtml(ticket.linkedTemplate.name || "")} · ${statusBadge(ticket.linkedTemplate.status || "draft")}
         <span class="muted">${escapeHtml(ticket.linkedTemplate.dedupeKey || "")}</span></p>
       <p class="muted">工单不提供发布入库。要上图鉴请到「图鉴 → 小卡模板」。</p>`
    : `<p class="muted">尚未关联模板</p>`;

  return `
    <section class="card">
      <p><a href="#/tickets">← 工单列表</a></p>
      <h1>工单</h1>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="ticket-notice">${escapeHtml(notice)}</p>` : ""}
      <p>${ticketStatusBadge(ticket.status)} · ${escapeHtml(ticket.user.nickname)} · ${when(ticket.createdAt)}</p>
      ${ticket.assignee ? `<p class="muted">处理人 ${escapeHtml(ticket.assignee.username)}</p>` : ""}
      <div class="ticket-body">${escapeHtml(ticket.body)}</div>
      <div class="row-actions">${statusBtns}</div>
      <form class="form" id="ticket-close-form" style="margin-top:16px">
        <label>内部备注（关闭时必填，不展示给 C 端）</label>
        <textarea name="internalNote" rows="3">${escapeHtml(ticket.internalNote || "")}</textarea>
        <p class="muted">点「完成 / 不修复」时会带上这段备注。</p>
      </form>
    </section>
    <section class="card">
      <h2>关联 PhotocardTemplate（草稿）</h2>
      ${linked}
      <form class="form" id="ticket-link-form">
        <label>已有模板</label>
        <select name="templateId">${tplOpts}</select>
        <button class="btn" type="submit">关联已有模板</button>
      </form>
      <form class="form" id="ticket-create-form" style="margin-top:16px">
        <h2>新建草稿模板并关联</h2>
        <p class="muted">只会建成 <strong>draft</strong>，不会发布到图鉴。</p>
        <label>发行</label><select name="releaseId" required>${relOpts}</select>
        <label>成员</label><select name="memberId">${memOpts}</select>
        <label>版本</label><input name="version" required placeholder="例如 POB-missing" />
        <label>名称</label><input name="name" />
        <label class="check"><input type="checkbox" name="isBenefit" /> 特典</label>
        <button class="btn" type="submit">创建草稿并关联</button>
      </form>
    </section>`;
}
