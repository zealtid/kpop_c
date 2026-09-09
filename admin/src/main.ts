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

const app = document.querySelector("#app") as HTMLDivElement;
let page: "login" | "catalog" | "intel" = "catalog";
let catalogTab: CatalogTab = "groups";
let editingId: string | null = null;
let catalogNotice = "";
let user: OpsUser | null = null;
let notice = "";

function parseHash(): { page: "login" | "catalog" | "intel"; tab: CatalogTab } {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("intel")) return { page: "intel", tab: catalogTab };
  if (h.startsWith("login")) return { page: "login", tab: catalogTab };
  const part = h.split("/")[1];
  const tab: CatalogTab =
    part === "members" || part === "releases" || part === "templates" || part === "groups" ? part : "groups";
  return { page: "catalog", tab };
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
  render();
}

function navLink(id: "catalog" | "intel", label: string) {
  const href = id === "catalog" ? `#/catalog/${catalogTab}` : `#/${id}`;
  return `<a href="${href}" class="${page === id ? "active" : ""}">${label}</a>`;
}

function layout(inner: string) {
  return `
    <div class="shell">
      <header class="top">
        <div class="brand">星卡运营后台</div>
        <nav class="nav">${navLink("catalog", "图鉴")} ${navLink("intel", "情报")}</nav>
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

  const data = await loadCatalog(catalogTab);
  if ("error" in data) {
    const denied = data.status === 403;
    app.innerHTML = layout(
      `<section class="card"><p class="err">${denied ? "没有权限访问运营接口" : escapeHtml(data.error)}</p></section>`,
    );
    bindShell();
    return;
  }

  const innerNav = `<nav class="subnav">${catalogSubnav(catalogTab)}</nav>`;
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
  page = route.page === "login" ? "catalog" : route.page;
  catalogTab = route.tab;
  render();
});

hydrate();
