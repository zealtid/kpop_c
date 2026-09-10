import "./styles.css";
import { api, clearToken, errorMessage, getToken, setToken } from "./api";
import { escapeHtml } from "./html";
import {
  type CatalogTab,
  catalogSubnav,
  findById,
  groupsView,
  loadCatalog,
  membersView,
  releasesView,
  saveCatalog,
  setCatalogStatus,
  templatesView,
} from "./catalogPage";
import { completenessView, type CompletenessGroup } from "./completenessPage";
import { buildImportBody, importView, type ImportReport } from "./importPage";
import { benefitMapView, type BenefitMapRow, type BenefitReport } from "./benefitMapPage";
import { ticketDetailView, ticketsListView, type Ticket } from "./ticketsPage";

type Menu = { id: string; label: string };
type OpsUser = { id: string | null; username: string; role: string; menus: Menu[] };
type FeedItem = {
  id: string;
  title: string;
  status: string;
  trustLevel: string;
  sourceNote?: string | null;
  canonicalUrl?: string | null;
};
type ScheduleEvent = {
  id: string;
  title: string;
  status: string;
  kind: string;
  startAtShanghai?: string;
  group?: { nameZh?: string; slug?: string };
};
type AuditLog = {
  id: string;
  actorUsername: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

type Page = "login" | "catalog" | "intel" | "tickets";

const app = document.querySelector("#app") as HTMLDivElement;
let page: Page = "catalog";
let catalogTab: CatalogTab = "groups";
let editingId: string | null = null;
let catalogNotice = "";
let importText = "";
let importFormat = "csv";
let importReport: ImportReport | null = null;
let importCommitted = false;
let benefitText = "";
let benefitReport: BenefitReport | null = null;
let benefitCommitted = false;
let benefitWritten = 0;
let benefitTagsStrict = false;
let benefitReleaseFilter = "";
let user: OpsUser | null = null;
let notice = "";
let ticketId: string | null = null;
let ticketStatusFilter = "open";
let ticketNotice = "";

function parseHash(): { page: Page; tab: CatalogTab; ticketId: string | null } {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("intel")) return { page: "intel", tab: catalogTab, ticketId: null };
  if (h.startsWith("login")) return { page: "login", tab: catalogTab, ticketId: null };
  if (h.startsWith("tickets")) {
    const id = h.split("/")[1] || null;
    return { page: "tickets", tab: catalogTab, ticketId: id };
  }
  const part = h.split("/")[1];
  const tab: CatalogTab =
    part === "members" ||
    part === "releases" ||
    part === "templates" ||
    part === "groups" ||
    part === "completeness" ||
    part === "import" ||
    part === "benefits"
      ? part
      : "groups";
  return { page: "catalog", tab, ticketId: null };
}

async function hydrate() {
  if (!getToken()) {
    page = "login";
    render();
    return;
  }
  const me = await api<{ user: OpsUser }>("/admin/auth/me");
  if (me.status !== 200) {
    clearToken();
    page = "login";
    render();
    return;
  }
  user = me.body.user;
  const route = parseHash();
  page = route.page === "login" ? "catalog" : route.page;
  catalogTab = route.tab;
  ticketId = route.ticketId;
  render();
}

function menuHref(id: string) {
  if (id === "catalog") return `#/catalog/${catalogTab}`;
  return `#/${id}`;
}

function navHtml() {
  const menus = user?.menus?.length
    ? user.menus
    : [
        { id: "catalog", label: "图鉴" },
        { id: "intel", label: "情报" },
        { id: "tickets", label: "反馈/工单" },
      ];
  return menus
    .map(
      (m) =>
        `<a href="${menuHref(m.id)}" class="${page === m.id ? "active" : ""}">${escapeHtml(m.label)}</a>`,
    )
    .join(" ");
}

function layout(inner: string) {
  return `
    <div class="shell">
      <header class="top">
        <div class="brand">星卡运营后台</div>
        <nav class="nav">${navHtml()}</nav>
        <div class="who">
          <span>${user?.username || ""} · ${user?.role || ""}</span>
          <button class="btn ghost" id="logout" type="button">退出</button>
        </div>
      </header>
      <main class="main">${inner}</main>
    </div>`;
}

function loginView() {
  return `
    <form class="login" id="login-form">
      <h1>星卡运营后台</h1>
      <p class="muted">用户名 / 密码登录（无微信扫码）</p>
      <label>用户名</label>
      <input name="username" autocomplete="username" required />
      <label>密码</label>
      <input name="password" type="password" autocomplete="current-password" required />
      <button class="btn" type="submit">登录</button>
      <div class="err" id="login-err">${notice}</div>
    </form>`;
}

function intelView(feeds: FeedItem[], events: ScheduleEvent[]) {
  const feedRows = feeds
    .slice(0, 30)
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.title)}</td><td><span class="badge">${escapeHtml(f.status)}</span></td><td>${escapeHtml(f.trustLevel)}</td><td>${escapeHtml(f.sourceNote || "")}</td></tr>`,
    )
    .join("");
  const evRows = events
    .slice(0, 30)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.kind)}</td><td><span class="badge">${escapeHtml(e.status)}</span></td><td>${escapeHtml(e.startAtShanghai || "")}</td></tr>`,
    )
    .join("");
  return layout(`
    <section class="card">
      <h1>情报</h1>
      <p class="muted">只读接入已有 M2-a Admin Feed / Schedule API。录入仍走脚本或 <code>x-admin-token</code>。</p>
      <h2>Feed</h2>
      ${
        feeds.length
          ? `<table><thead><tr><th>标题</th><th>状态</th><th>信任</th><th>来源</th></tr></thead><tbody>${feedRows}</tbody></table>`
          : `<p class="empty">暂无情报</p>`
      }
      <h2 style="margin-top:20px">日程</h2>
      ${
        events.length
          ? `<table><thead><tr><th>标题</th><th>类型</th><th>状态</th><th>上海时间</th></tr></thead><tbody>${evRows}</tbody></table>`
          : `<p class="empty">暂无日程</p>`
      }
    </section>
    <section class="card" id="audit-card"><h2>最近审计</h2><p class="muted">加载中…</p></section>
  `);
}

function bindShell() {
  document.getElementById("logout")?.addEventListener("click", async () => {
    await api("/admin/auth/logout", { method: "POST" });
    clearToken();
    user = null;
    page = "login";
    location.hash = "#/login";
    render();
  });
}

async function fillAudit() {
  const el = document.getElementById("audit-card");
  if (!el) return;
  const res = await api<{ logs: AuditLog[] }>("/admin/audit?limit=8");
  if (res.status !== 200) {
    el.innerHTML = `<h2>最近审计</h2><p class="err">${escapeHtml(errorMessage(res.body))}</p>`;
    return;
  }
  const items = res.body.logs
    .map(
      (l) =>
        `<li><strong>${escapeHtml(l.actorUsername)}</strong> ${escapeHtml(l.action)} ${escapeHtml(l.entityType || "")} ${escapeHtml(l.entityId || "").slice(0, 8)} · ${escapeHtml(l.createdAt)}</li>`,
    )
    .join("");
  el.innerHTML = `<h2>最近审计</h2><ul class="audit">${items || "<li>暂无记录</li>"}</ul>`;
}

function bindCatalog(rows: { id: string }[]) {
  document.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingId = btn.dataset.edit || null;
      catalogNotice = "";
      render();
    });
  });
  document.getElementById("form-cancel")?.addEventListener("click", () => {
    editingId = null;
    catalogNotice = "";
    render();
  });
  document.getElementById("catalog-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target as HTMLFormElement);
    const res = await saveCatalog(catalogTab, editingId, fd);
    if (res.status !== 200) {
      catalogNotice = errorMessage(res.body);
      render();
      return;
    }
    editingId = null;
    catalogNotice = "已保存";
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr?.getAttribute("data-id");
      const status = btn.dataset.act;
      if (!id || !status) return;
      const res = await setCatalogStatus(catalogTab, id, status);
      catalogNotice = res.status === 200 ? `已更新为 ${status}` : errorMessage(res.body);
      render();
    });
  });
  void rows;
}

function bindImport() {
  const form = document.getElementById("import-form") as HTMLFormElement | null;
  const formatEl = document.getElementById("import-format") as HTMLSelectElement | null;
  const textEl = document.getElementById("import-text") as HTMLTextAreaElement | null;
  formatEl?.addEventListener("change", () => {
    importFormat = formatEl.value;
  });
  textEl?.addEventListener("input", () => {
    importText = textEl.value;
  });
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    importFormat = formatEl?.value || "csv";
    importText = textEl?.value || "";
    const res = await api<{ committed: boolean; report: ImportReport }>("/admin/import/validate", {
      method: "POST",
      body: JSON.stringify(buildImportBody(importFormat, importText, true)),
    });
    importCommitted = false;
    if (res.status !== 200) {
      const details = (res.body as { error?: { details?: ImportReport } })?.error?.details;
      importReport = details || null;
      catalogNotice = errorMessage(res.body);
      render();
      return;
    }
    importReport = res.body.report;
    catalogNotice = importReport.ok ? "校验通过，可以写入" : "校验未通过，请先修错误";
    render();
  });
  document.getElementById("import-commit")?.addEventListener("click", async () => {
    if (!importReport?.ok) return;
    importFormat = formatEl?.value || importFormat;
    importText = textEl?.value || importText;
    const res = await api<{ committed: boolean; report: ImportReport; count?: number }>("/admin/import", {
      method: "POST",
      body: JSON.stringify(buildImportBody(importFormat, importText, false)),
    });
    if (res.status !== 200) {
      const details = (res.body as { error?: { details?: ImportReport } })?.error?.details;
      importReport = details || importReport;
      importCommitted = false;
      catalogNotice = errorMessage(res.body);
      render();
      return;
    }
    importReport = res.body.report;
    importCommitted = !!res.body.committed;
    catalogNotice = importCommitted ? `已写入 ${res.body.count ?? 0} 条模板` : "未写入";
    render();
  });
}

function bindBenefit() {
  const textEl = document.getElementById("benefit-text") as HTMLTextAreaElement | null;
  const fileEl = document.getElementById("benefit-file") as HTMLInputElement | null;
  const strictEl = document.getElementById("benefit-tags-strict") as HTMLInputElement | null;
  const form = document.getElementById("benefit-form") as HTMLFormElement | null;
  textEl?.addEventListener("input", () => {
    benefitText = textEl.value;
  });
  strictEl?.addEventListener("change", () => {
    benefitTagsStrict = !!strictEl.checked;
  });
  fileEl?.addEventListener("change", async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    benefitText = await file.text();
    if (textEl) textEl.value = benefitText;
  });
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    benefitText = textEl?.value || benefitText;
    benefitTagsStrict = !!strictEl?.checked;
    const res = await api<{ committed: boolean; report: BenefitReport }>("/admin/version-benefit/validate", {
      method: "POST",
      body: JSON.stringify({ text: benefitText, tagsStrict: benefitTagsStrict }),
    });
    benefitCommitted = false;
    benefitWritten = 0;
    if (res.status !== 200) {
      benefitReport = null;
      catalogNotice = errorMessage(res.body);
      render();
      return;
    }
    benefitReport = res.body.report;
    catalogNotice = benefitReport.ok ? "校验通过，可写入 confirmed 行" : "校验未通过，请先修错误";
    render();
  });
  document.getElementById("benefit-commit")?.addEventListener("click", async () => {
    benefitText = textEl?.value || benefitText;
    benefitTagsStrict = !!strictEl?.checked;
    const res = await api<{ committed: boolean; report: BenefitReport; written?: number }>(
      "/admin/version-benefit/import",
      {
        method: "POST",
        body: JSON.stringify({ text: benefitText, tagsStrict: benefitTagsStrict }),
      },
    );
    if (res.status !== 200) {
      benefitCommitted = false;
      catalogNotice = errorMessage(res.body);
      render();
      return;
    }
    benefitReport = res.body.report;
    benefitWritten = res.body.written || 0;
    benefitCommitted = benefitWritten > 0;
    catalogNotice = benefitWritten ? `已写入 ${benefitWritten} 条 confirmed 对照（只读）` : "没有可写入的 confirmed 行";
    render();
  });
  document.getElementById("benefit-release")?.addEventListener("change", (ev) => {
    benefitReleaseFilter = (ev.target as HTMLSelectElement).value;
    render();
  });
}

function ticketNote() {
  const area = document.querySelector<HTMLTextAreaElement>("#ticket-close-form textarea");
  return area?.value || "";
}

function bindTickets() {
  document.querySelectorAll<HTMLAnchorElement>("[data-ticket-filter]").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      ticketStatusFilter = a.dataset.ticketFilter || "";
      ticketNotice = "";
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-ticket-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!ticketId) return;
      const status = btn.dataset.ticketStatus;
      if (!status) return;
      const res = await api<Ticket>(`/admin/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, internalNote: ticketNote() }),
      });
      ticketNotice = res.status === 200 ? `已更新为 ${status}` : errorMessage(res.body);
      render();
    });
  });
  document.getElementById("ticket-link-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ticketId) return;
    const fd = new FormData(ev.target as HTMLFormElement);
    const templateId = String(fd.get("templateId") || "");
    if (!templateId) {
      ticketNotice = "请选择要关联的模板";
      render();
      return;
    }
    const res = await api<Ticket>(`/admin/tickets/${ticketId}/templates`, {
      method: "POST",
      body: JSON.stringify({ templateId }),
    });
    ticketNotice = res.status === 200 ? "已关联模板" : errorMessage(res.body);
    render();
  });
  document.getElementById("ticket-create-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ticketId) return;
    const fd = new FormData(ev.target as HTMLFormElement);
    const res = await api<{ ticket: Ticket }>(`/admin/tickets/${ticketId}/templates`, {
      method: "POST",
      body: JSON.stringify({
        releaseId: String(fd.get("releaseId") || ""),
        memberId: String(fd.get("memberId") || "") || undefined,
        version: String(fd.get("version") || ""),
        name: String(fd.get("name") || "") || undefined,
        isBenefit: fd.get("isBenefit") === "on",
      }),
    });
    ticketNotice = res.status === 200 ? "已创建草稿模板并关联" : errorMessage(res.body);
    render();
  });
}

async function render() {
  if (page === "login" || !user) {
    app.innerHTML = loginView();
    document.getElementById("login-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target as HTMLFormElement);
      const res = await api<{ token: string; user: OpsUser }>("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(fd.get("username") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      if (res.status !== 200) {
        notice = errorMessage(res.body, "登录失败");
        render();
        return;
      }
      notice = "";
      setToken(res.body.token);
      user = res.body.user;
      if (user.role !== "ops") {
        notice = "该角色尚未启用运营后台（reviewer 仅预留）";
        clearToken();
        user = null;
        page = "login";
        render();
        return;
      }
      page = "catalog";
      location.hash = "#/catalog/groups";
      render();
    });
    return;
  }

  if (page === "intel") {
    const [feed, schedule] = await Promise.all([
      api<{ items: FeedItem[] }>("/admin/feed"),
      api<{ events: ScheduleEvent[] }>("/admin/schedule"),
    ]);
    if (feed.status === 403 || schedule.status === 403) {
      app.innerHTML = layout(`<section class="card"><p class="err">没有权限访问运营接口</p></section>`);
      bindShell();
      return;
    }
    if (feed.status !== 200 || schedule.status !== 200) {
      app.innerHTML = layout(
        `<section class="card"><p class="err">${escapeHtml(errorMessage(feed.body) || errorMessage(schedule.body))}</p></section>`,
      );
      bindShell();
      return;
    }
    app.innerHTML = intelView(feed.body.items || [], schedule.body.events || []);
    bindShell();
    await fillAudit();
    return;
  }

  if (page === "tickets") {
    if (ticketId) {
      const [ticketRes, catalog] = await Promise.all([
        api<Ticket>(`/admin/tickets/${ticketId}`),
        loadCatalog("templates"),
      ]);
      if (ticketRes.status === 403 || ("error" in catalog && catalog.status === 403)) {
        app.innerHTML = layout(`<section class="card"><p class="err">没有权限访问运营接口</p></section>`);
        bindShell();
        return;
      }
      if (ticketRes.status !== 200) {
        app.innerHTML = layout(
          `<section class="card"><p class="err">${escapeHtml(errorMessage(ticketRes.body))}</p></section>`,
        );
        bindShell();
        return;
      }
      const releases = "error" in catalog ? [] : catalog.releases;
      const members = "error" in catalog ? [] : catalog.members;
      const templates = "error" in catalog ? [] : catalog.templates;
      app.innerHTML = layout(
        ticketDetailView(ticketRes.body, releases, members, templates, ticketNotice) +
          `<section class="card" id="audit-card"><h2>最近审计</h2></section>`,
      );
      bindShell();
      bindTickets();
      await fillAudit();
      return;
    }
    const qs = ticketStatusFilter ? `?status=${encodeURIComponent(ticketStatusFilter)}` : "";
    const res = await api<{ tickets: Ticket[]; total: number }>(`/admin/tickets${qs}`);
    if (res.status === 403) {
      app.innerHTML = layout(`<section class="card"><p class="err">没有权限访问运营接口</p></section>`);
      bindShell();
      return;
    }
    if (res.status !== 200) {
      app.innerHTML = layout(
        `<section class="card"><p class="err">${escapeHtml(errorMessage(res.body))}</p></section>`,
      );
      bindShell();
      return;
    }
    app.innerHTML = layout(
      ticketsListView(res.body.tickets || [], ticketStatusFilter, ticketNotice, res.body.total || 0) +
        `<section class="card" id="audit-card"><h2>最近审计</h2></section>`,
    );
    bindShell();
    bindTickets();
    await fillAudit();
    return;
  }

  const innerNav = `<nav class="subnav">${catalogSubnav(catalogTab)}</nav>`;

  if (catalogTab === "completeness") {
    const res = await api<{ groups: CompletenessGroup[] }>("/admin/completeness");
    if (res.status === 403) {
      app.innerHTML = layout(`<section class="card"><p class="err">没有权限访问运营接口</p></section>`);
      bindShell();
      return;
    }
    if (res.status !== 200) {
      app.innerHTML = layout(
        innerNav + `<section class="card"><p class="err">${escapeHtml(errorMessage(res.body))}</p></section>`,
      );
      bindShell();
      return;
    }
    app.innerHTML = layout(
      innerNav + completenessView(res.body.groups || []) + `<section class="card" id="audit-card"><h2>最近审计</h2></section>`,
    );
    bindShell();
    await fillAudit();
    return;
  }

  if (catalogTab === "import") {
    app.innerHTML = layout(
      innerNav +
        importView({
          format: importFormat,
          text: importText,
          notice: catalogNotice,
          report: importReport,
          committed: importCommitted,
        }) +
        `<section class="card" id="audit-card"><h2>最近审计</h2></section>`,
    );
    bindShell();
    bindImport();
    await fillAudit();
    return;
  }

  if (catalogTab === "benefits") {
    const qs = benefitReleaseFilter ? `?releaseId=${encodeURIComponent(benefitReleaseFilter)}` : "";
    const [mapsRes, catalog] = await Promise.all([
      api<{ maps: BenefitMapRow[] }>(`/admin/version-benefit/maps${qs}`),
      loadCatalog("releases"),
    ]);
    if (mapsRes.status === 403 || ("error" in catalog && catalog.status === 403)) {
      app.innerHTML = layout(`<section class="card"><p class="err">没有权限访问运营接口</p></section>`);
      bindShell();
      return;
    }
    if (mapsRes.status !== 200) {
      app.innerHTML = layout(
        innerNav + `<section class="card"><p class="err">${escapeHtml(errorMessage(mapsRes.body))}</p></section>`,
      );
      bindShell();
      return;
    }
    const releases = "error" in catalog ? [] : catalog.releases;
    app.innerHTML = layout(
      innerNav +
        benefitMapView({
          text: benefitText,
          notice: catalogNotice,
          report: benefitReport,
          committed: benefitCommitted,
          written: benefitWritten,
          maps: mapsRes.body.maps || [],
          releases,
          releaseFilter: benefitReleaseFilter,
          tagsStrict: benefitTagsStrict,
        }) +
        `<section class="card" id="audit-card"><h2>最近审计</h2></section>`,
    );
    bindShell();
    bindBenefit();
    await fillAudit();
    return;
  }

  const data = await loadCatalog(catalogTab);
  if ("error" in data) {
    const denied = data.status === 403;
    app.innerHTML = layout(
      `<section class="card"><p class="err">${denied ? "没有权限访问运营接口" : escapeHtml(data.error || "请求失败")}</p></section>`,
    );
    bindShell();
    return;
  }

  let body = "";
  if (catalogTab === "groups") {
    body = groupsView(data.groups, findById(data.groups, editingId || ""), catalogNotice);
  } else if (catalogTab === "members") {
    body = membersView(data.members, data.groups, findById(data.members, editingId || ""), catalogNotice);
  } else if (catalogTab === "releases") {
    body = releasesView(data.releases, data.groups, findById(data.releases, editingId || ""), catalogNotice);
  } else {
    body = templatesView(
      data.templates,
      data.releases,
      data.members,
      findById(data.templates, editingId || ""),
      catalogNotice,
    );
  }
  app.innerHTML = layout(innerNav + body + `<section class="card" id="audit-card"><h2>最近审计</h2></section>`);
  if (catalogNotice) document.getElementById("catalog-notice")?.scrollIntoView({ block: "start" });
  bindShell();
  bindCatalog(
    catalogTab === "groups"
      ? data.groups
      : catalogTab === "members"
        ? data.members
        : catalogTab === "releases"
          ? data.releases
          : data.templates,
  );
  await fillAudit();
}

window.addEventListener("hashchange", () => {
  if (!user) return;
  const route = parseHash();
  if (route.page !== page || route.tab !== catalogTab) {
    editingId = null;
    catalogNotice = "";
  }
  if (route.ticketId !== ticketId) ticketNotice = "";
  page = route.page === "login" ? "catalog" : route.page;
  catalogTab = route.tab;
  ticketId = route.ticketId;
  render();
});

hydrate();
