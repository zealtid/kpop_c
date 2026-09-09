import "./styles.css";
import { api, clearToken, errorMessage, getToken, setToken } from "./api";

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
type Group = { id: string; slug: string; nameZh: string };

const app = document.querySelector("#app") as HTMLDivElement;
let page: "login" | "catalog" | "intel" = "catalog";
let user: OpsUser | null = null;
let notice = "";

function routeFromHash(): "login" | "catalog" | "intel" {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("intel")) return "intel";
  if (h.startsWith("login")) return "login";
  return "catalog";
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
  page = routeFromHash() === "login" ? "catalog" : routeFromHash();
  render();
}

function navLink(id: "catalog" | "intel", label: string) {
  return `<a href="#/${id}" class="${page === id ? "active" : ""}">${label}</a>`;
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
      <p class="muted">用户名 / 密码登录（OPS-0，无微信扫码）</p>
      <label>用户名</label>
      <input name="username" autocomplete="username" required />
      <label>密码</label>
      <input name="password" type="password" autocomplete="current-password" required />
      <button class="btn" type="submit">登录</button>
      <div class="err" id="login-err">${notice}</div>
    </form>`;
}

function catalogView(groups: Group[]) {
  const rows = groups
    .map((g) => `<tr><td>${escapeHtml(g.nameZh)}</td><td>${escapeHtml(g.slug)}</td></tr>`)
    .join("");
  return layout(`
    <section class="card">
      <h1>图鉴</h1>
      <div class="banner">OPS-1 CRUD 即将上线。本页仅为菜单壳，不提供草稿/发布或导入。</div>
      <p class="muted">只读预览当前库内组合（C 端公开图鉴）。</p>
      ${
        groups.length
          ? `<table><thead><tr><th>组合</th><th>slug</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<p class="empty">暂无组合</p>`
      }
    </section>
    <section class="card" id="audit-card"><h2>最近审计</h2><p class="muted">加载中…</p></section>
  `);
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      location.hash = "#/catalog";
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

  const groups = await api<{ groups: Group[] }>("/catalog/groups");
  app.innerHTML = catalogView(groups.status === 200 ? groups.body.groups || [] : []);
  bindShell();
  await fillAudit();
}

window.addEventListener("hashchange", () => {
  if (!user) return;
  page = routeFromHash() === "login" ? "catalog" : routeFromHash();
  render();
});

hydrate();
