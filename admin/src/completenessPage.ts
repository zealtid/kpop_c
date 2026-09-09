import { escapeHtml, statusBadge } from "./html";

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

function gateBadge(gate: PublishGate) {
  const label =
    gate.status === "blocked"
      ? "发布闸门 · 拦截"
      : gate.status === "incomplete"
        ? "发布闸门 · 不完整"
        : gate.status === "ready"
          ? "发布闸门 · 可发"
          : gate.status === "published"
            ? "已发布"
            : "开放";
  return `<span class="badge gate-${escapeHtml(gate.status)}">${escapeHtml(label)}</span>`;
}

function blockers(gate: PublishGate) {
  if (!gate.blockers.length) return `<span class="muted">无拦截</span>`;
  return `<ul class="blockers">${gate.blockers.map((b) => `<li>${escapeHtml(b.message)}</li>`).join("")}</ul>`;
}

export function completenessView(groups: CompletenessGroup[]) {
  if (!groups.length) {
    return `
      <section class="card">
        <h1>图鉴 · 完整度</h1>
        <p class="empty">暂无组合</p>
      </section>`;
  }
  const cards = groups
    .map((g) => {
      const relRows = g.releases
        .map((r) => {
          const missing = r.missingMembers.length
            ? r.missingMembers.map((m) => escapeHtml(m.nameEn)).join(", ")
            : "—";
          const slice =
            r.inAllowedSlice == null ? "未配置" : r.inAllowedSlice ? "切片内" : "切片外";
          return `
            <tr>
              <td>${escapeHtml(r.title)}<div class="muted">${escapeHtml(r.kind)} · ${escapeHtml(r.releasedOn || "")}</div></td>
              <td>${statusBadge(r.status)}</td>
              <td>${r.draftCount} / ${r.publishedCount} / ${r.deprecatedCount}</td>
              <td>${r.missingMainImage ? `<span class="warn">${r.missingMainImage}</span>` : "0"}</td>
              <td>${missing}</td>
              <td>${escapeHtml(slice)}</td>
              <td>${gateBadge(r.publishGate)}${blockers(r.publishGate)}</td>
            </tr>`;
        })
        .join("");
      return `
        <section class="card">
          <h2>${escapeHtml(g.nameZh)} <span class="muted">${escapeHtml(g.slug)}</span> ${statusBadge(g.status)}</h2>
          <p class="stats">
            草稿 ${g.draftCount} · 已发布 ${g.publishedCount} · 废弃 ${g.deprecatedCount}
            · 缺主图 ${g.missingMainImage} · 缺成员卡 ${g.missingMembers}
          </p>
          <p>${gateBadge(g.expansionGate)} ${escapeHtml(g.expansionGate.signOffNote)}</p>
          ${blockers(g.expansionGate)}
          ${
            g.releases.length
              ? `<div class="table-wrap"><table>
                  <thead><tr>
                    <th>发行</th><th>状态</th><th>草稿/发布/废弃</th><th>缺主图</th><th>缺成员</th><th>切片</th><th>发布闸门</th>
                  </tr></thead>
                  <tbody>${relRows}</tbody>
                </table></div>`
              : `<p class="empty">该组合暂无发行</p>`
          }
        </section>`;
    })
    .join("");
  return `
    <section class="card">
      <h1>图鉴 · 完整度</h1>
      <p class="muted">按组合 / 发行统计草稿与已发布、缺主图、缺成员。扩展专辑的发布闸门只展示状态，<strong>不</strong>接入签署人流程。</p>
    </section>
    ${cards}`;
}
