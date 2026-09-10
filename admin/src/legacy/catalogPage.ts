import { api, errorMessage } from "../api";
import { escapeHtml, option, statusBadge } from "./html";

export type CatalogTab = "groups" | "members" | "releases" | "templates" | "completeness" | "import" | "benefits";

type Group = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  nameKo?: string;
  aliases?: string;
  logoColor?: string;
  scopeNote?: string | null;
  isPilot?: boolean;
  status: string;
};

type Member = {
  id: string;
  groupId: string;
  nameZh: string;
  nameEn: string;
  nameKo?: string;
  aliases?: string;
  color?: string;
  sortOrder?: number;
  status: string;
  groupNameZh?: string;
};

type Release = {
  id: string;
  groupId: string;
  title: string;
  titleZh?: string | null;
  aliases?: string;
  releasedOn?: string | null;
  kind: string;
  status: string;
  groupNameZh?: string;
};

type Template = {
  id: string;
  name: string;
  version: string;
  code?: string;
  status: string;
  catalogStatus?: string;
  isBenefit?: boolean;
  isDeprecated?: boolean;
  mainImageUrl?: string | null;
  dedupeKey?: string;
  releaseId: string;
  releaseTitle?: string;
  memberId?: string | null;
  memberNameEn?: string | null;
  groupNameZh?: string;
};

const TABS: { id: CatalogTab; label: string }[] = [
  { id: "groups", label: "组合" },
  { id: "members", label: "成员" },
  { id: "releases", label: "发行" },
  { id: "templates", label: "小卡模板" },
  { id: "completeness", label: "完整度" },
  { id: "import", label: "导入" },
  { id: "benefits", label: "特典对照" },
];

export function catalogSubnav(tab: CatalogTab) {
  return TABS.map(
    (t) => `<a href="#/catalog/${t.id}" class="${tab === t.id ? "active" : ""}">${t.label}</a>`,
  ).join(" ");
}

function statusButtons(prefix: string, current: string) {
  const btns: string[] = [];
  if (current !== "published") {
    btns.push(`<button class="btn small ok" type="button" data-act="published" data-prefix="${prefix}">发布</button>`);
  }
  if (current !== "draft") {
    btns.push(`<button class="btn small ghost" type="button" data-act="draft" data-prefix="${prefix}">撤回草稿</button>`);
  }
  if (current !== "deprecated") {
    btns.push(`<button class="btn small danger" type="button" data-act="deprecated" data-prefix="${prefix}">废弃</button>`);
  }
  return `<div class="row-actions">${btns.join("")}</div>`;
}

function formActions(editing: boolean) {
  return `
    <div class="row-actions">
      <button class="btn small" type="submit">${editing ? "保存" : "创建为草稿"}</button>
      ${editing ? `<button class="btn small ghost" type="button" id="form-cancel">取消</button>` : ""}
    </div>`;
}

export function groupsView(groups: Group[], editing: Group | null, notice: string) {
  const rows = groups
    .map(
      (g) => `
      <tr data-id="${escapeHtml(g.id)}">
        <td><button class="linkish" type="button" data-edit="${escapeHtml(g.id)}">${escapeHtml(g.nameZh)}</button></td>
        <td>${escapeHtml(g.slug)}</td>
        <td>${statusBadge(g.status)}</td>
        <td>${statusButtons("group", g.status)}</td>
      </tr>`,
    )
    .join("");
  const e = editing;
  return `
    <section class="card">
      <h1>图鉴 · 组合</h1>
      <p class="muted">ArtistGroup → <code>idol_groups</code>。新建为草稿；发布后才出现在小程序图鉴。</p>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <div class="split">
        <div>
          ${
            groups.length
              ? `<table><thead><tr><th>名称</th><th>slug</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
              : `<p class="empty">暂无组合</p>`
          }
        </div>
        <form class="form" id="catalog-form">
          <h2>${e ? "编辑组合" : "新建组合"}</h2>
          <label>slug</label><input name="slug" required value="${escapeHtml(e?.slug || "")}" />
          <label>中文名</label><input name="nameZh" required value="${escapeHtml(e?.nameZh || "")}" />
          <label>英文名</label><input name="nameEn" required value="${escapeHtml(e?.nameEn || "")}" />
          <label>韩文名</label><input name="nameKo" value="${escapeHtml(e?.nameKo || "")}" />
          <label>别名</label><input name="aliases" value="${escapeHtml(e?.aliases || "")}" />
          <label>主题色</label><input name="logoColor" value="${escapeHtml(e?.logoColor || "#ff6b9d")}" />
          <label>范围说明</label><input name="scopeNote" value="${escapeHtml(e?.scopeNote || "")}" />
          <label class="check"><input type="checkbox" name="isPilot" ${e?.isPilot !== false ? "checked" : ""} /> 试点组合</label>
          ${formActions(!!e)}
        </form>
      </div>
    </section>`;
}

export function membersView(members: Member[], groups: Group[], editing: Member | null, notice: string) {
  const rows = members
    .map(
      (m) => `
      <tr data-id="${escapeHtml(m.id)}">
        <td><button class="linkish" type="button" data-edit="${escapeHtml(m.id)}">${escapeHtml(m.nameEn)}</button></td>
        <td>${escapeHtml(m.nameZh || "")}</td>
        <td>${escapeHtml(m.groupNameZh || "")}</td>
        <td>${statusBadge(m.status)}</td>
        <td>${statusButtons("member", m.status)}</td>
      </tr>`,
    )
    .join("");
  const e = editing;
  const groupOpts = groups.map((g) => option(g.id, `${g.nameZh} (${g.slug})`, e?.groupId)).join("");
  return `
    <section class="card">
      <h1>图鉴 · 成员</h1>
      <p class="muted">Member。草稿成员不出现在小程序组合页。</p>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <div class="split">
        <div>
          ${
            members.length
              ? `<table><thead><tr><th>英文</th><th>中文</th><th>组合</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
              : `<p class="empty">暂无成员</p>`
          }
        </div>
        <form class="form" id="catalog-form">
          <h2>${e ? "编辑成员" : "新建成员"}</h2>
          <label>组合</label><select name="groupId" required>${groupOpts}</select>
          <label>英文名</label><input name="nameEn" required value="${escapeHtml(e?.nameEn || "")}" />
          <label>中文名</label><input name="nameZh" required value="${escapeHtml(e?.nameZh || "")}" />
          <label>韩文名</label><input name="nameKo" value="${escapeHtml(e?.nameKo || "")}" />
          <label>别名</label><input name="aliases" value="${escapeHtml(e?.aliases || "")}" />
          <label>颜色</label><input name="color" value="${escapeHtml(e?.color || "#888888")}" />
          <label>排序</label><input name="sortOrder" type="number" value="${e?.sortOrder ?? 0}" />
          ${formActions(!!e)}
        </form>
      </div>
    </section>`;
}

export function releasesView(releases: Release[], groups: Group[], editing: Release | null, notice: string) {
  const rows = releases
    .map(
      (r) => `
      <tr data-id="${escapeHtml(r.id)}">
        <td><button class="linkish" type="button" data-edit="${escapeHtml(r.id)}">${escapeHtml(r.title)}</button></td>
        <td>${escapeHtml(r.groupNameZh || "")}</td>
        <td>${escapeHtml(r.kind)}${r.kind === "concert_md" ? " · 特典" : ""}</td>
        <td>${escapeHtml(r.releasedOn || "")}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${statusButtons("release", r.status)}</td>
      </tr>`,
    )
    .join("");
  const e = editing;
  const groupOpts = groups.map((g) => option(g.id, `${g.nameZh} (${g.slug})`, e?.groupId)).join("");
  const kinds = [
    ["album", "专辑 album"],
    ["single", "单曲 single"],
    ["mini", "迷你 mini"],
    ["concert_md", "演唱会特典 concert_md"],
  ];
  const kindOpts = kinds.map(([v, l]) => option(v, l, e?.kind || "album")).join("");
  return `
    <section class="card">
      <h1>图鉴 · 发行</h1>
      <p class="muted">Release。演唱会特典用 <code>kind=concert_md</code>，<strong>没有</strong>独立 Event 表。</p>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <div class="split">
        <div>
          ${
            releases.length
              ? `<table><thead><tr><th>标题</th><th>组合</th><th>类型</th><th>日期</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
              : `<p class="empty">暂无发行</p>`
          }
        </div>
        <form class="form" id="catalog-form">
          <h2>${e ? "编辑发行" : "新建发行"}</h2>
          <label>组合</label><select name="groupId" required>${groupOpts}</select>
          <label>标题</label><input name="title" required value="${escapeHtml(e?.title || "")}" />
          <label>中文标题</label><input name="titleZh" value="${escapeHtml(e?.titleZh || "")}" />
          <label>别名</label><input name="aliases" value="${escapeHtml(e?.aliases || "")}" />
          <label>发行日</label><input name="releasedOn" type="date" required value="${escapeHtml(e?.releasedOn || "")}" />
          <label>类型</label><select name="kind">${kindOpts}</select>
          ${formActions(!!e)}
        </form>
      </div>
    </section>`;
}

export function templatesView(
  templates: Template[],
  releases: Release[],
  members: Member[],
  editing: Template | null,
  notice: string,
) {
  const rows = templates
    .map((t) => {
      const st = t.catalogStatus || (t.isDeprecated ? "deprecated" : t.status);
      return `
      <tr data-id="${escapeHtml(t.id)}">
        <td><button class="linkish" type="button" data-edit="${escapeHtml(t.id)}">${escapeHtml(t.name)}</button></td>
        <td>${escapeHtml(t.releaseTitle || "")}</td>
        <td>${escapeHtml(t.memberNameEn || "group")}</td>
        <td>${escapeHtml(t.version)}</td>
        <td>${t.isBenefit ? "特典" : ""}</td>
        <td>${t.mainImageUrl ? "有图" : "<span class='warn'>无主图</span>"}</td>
        <td>${statusBadge(st)}</td>
        <td>${statusButtons("template", st)}</td>
      </tr>`;
    })
    .join("");
  const e = editing;
  const relOpts = releases.map((r) => option(r.id, `${r.groupNameZh || ""} · ${r.title}`, e?.releaseId)).join("");
  const memOpts =
    option("", "（组合卡 / 无成员）", e?.memberId || "") +
    members.map((m) => option(m.id, `${m.groupNameZh || ""} · ${m.nameEn}`, e?.memberId || "")).join("");
  return `
    <section class="card">
      <h1>图鉴 · 小卡模板</h1>
      <p class="muted">PhotocardTemplate。<strong>无主图不能发布</strong>。去重键 = slug:发行标题:成员:version。</p>
      ${notice ? `<p class="${/^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <div class="split">
        <div class="table-wrap">
          ${
            templates.length
              ? `<table><thead><tr><th>名称</th><th>发行</th><th>成员</th><th>版本</th><th></th><th>图</th><th>状态</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
              : `<p class="empty">暂无模板</p>`
          }
        </div>
        <form class="form" id="catalog-form">
          <h2>${e ? "编辑模板" : "新建模板（草稿）"}</h2>
          <label>发行</label><select name="releaseId" required>${relOpts}</select>
          <label>成员</label><select name="memberId">${memOpts}</select>
          <label>版本</label><input name="version" required value="${escapeHtml(e?.version || "")}" />
          <label>名称</label><input name="name" value="${escapeHtml(e?.name || "")}" />
          <label>主图 URL</label><input name="mainImageUrl" placeholder="/media/cards/xxx.png" value="${escapeHtml(e?.mainImageUrl || "")}" />
          <label class="check"><input type="checkbox" name="isBenefit" ${e?.isBenefit ? "checked" : ""} /> 特典</label>
          ${e?.dedupeKey ? `<p class="muted">去重键 ${escapeHtml(e.dedupeKey)}</p>` : ""}
          ${formActions(!!e)}
        </form>
      </div>
    </section>`;
}

export async function loadCatalog(tab: CatalogTab) {
  const [groups, members, releases, templates] = await Promise.all([
    api<{ groups: Group[] }>("/admin/catalog/groups"),
    api<{ members: Member[] }>("/admin/catalog/members"),
    api<{ releases: Release[] }>("/admin/catalog/releases"),
    api<{ templates: Template[] }>("/admin/catalog/templates"),
  ]);
  const failed = [groups, members, releases, templates].find((r) => r.status !== 200);
  if (failed) {
    return { error: errorMessage(failed.body), status: failed.status };
  }
  return {
    groups: groups.body.groups || [],
    members: members.body.members || [],
    releases: releases.body.releases || [],
    templates: templates.body.templates || [],
    tab,
  };
}

function formPayload(tab: CatalogTab, fd: FormData): Record<string, unknown> {
  const str = (k: string) => String(fd.get(k) || "").trim();
  if (tab === "groups") {
    return {
      slug: str("slug"),
      nameZh: str("nameZh"),
      nameEn: str("nameEn"),
      nameKo: str("nameKo"),
      aliases: str("aliases"),
      logoColor: str("logoColor"),
      scopeNote: str("scopeNote"),
      isPilot: fd.get("isPilot") === "on",
    };
  }
  if (tab === "members") {
    return {
      groupId: str("groupId"),
      nameEn: str("nameEn"),
      nameZh: str("nameZh"),
      nameKo: str("nameKo"),
      aliases: str("aliases"),
      color: str("color"),
      sortOrder: Number(str("sortOrder") || 0),
    };
  }
  if (tab === "releases") {
    return {
      groupId: str("groupId"),
      title: str("title"),
      titleZh: str("titleZh"),
      aliases: str("aliases"),
      releasedOn: str("releasedOn"),
      kind: str("kind") || "album",
    };
  }
  return {
    releaseId: str("releaseId"),
    memberId: str("memberId") || undefined,
    version: str("version"),
    name: str("name") || undefined,
    mainImageUrl: str("mainImageUrl") || null,
    isBenefit: fd.get("isBenefit") === "on",
  };
}

const PATH: Record<"groups" | "members" | "releases" | "templates", string> = {
  groups: "/admin/catalog/groups",
  members: "/admin/catalog/members",
  releases: "/admin/catalog/releases",
  templates: "/admin/catalog/templates",
};

export async function saveCatalog(tab: CatalogTab, editingId: string | null, fd: FormData) {
  if (tab === "completeness" || tab === "import" || tab === "benefits") {
    throw new Error("该页不支持表单保存");
  }
  const body = formPayload(tab, fd);
  const path = editingId ? `${PATH[tab]}/${editingId}` : PATH[tab];
  return api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) });
}

export async function setCatalogStatus(tab: CatalogTab, id: string, status: string) {
  if (tab === "completeness" || tab === "import" || tab === "benefits") {
    throw new Error("该页不支持状态变更");
  }
  return api(`${PATH[tab]}/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
}

export function findById<T extends { id: string }>(rows: T[], id: string) {
  return rows.find((r) => r.id === id) || null;
}
