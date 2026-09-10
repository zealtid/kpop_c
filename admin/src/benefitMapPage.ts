import { escapeHtml, option } from "./html";

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
};

export type BenefitReleaseOpt = { id: string; title: string; groupNameZh?: string };

export const BENEFIT_CSV_PLACEHOLDER = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status,benefit_batch,benefit_type,tags_hint
bts,bts-arirang,standard,weverse,预购特典 Weverse,预购特典 Weverse,slots,https://example.invalid/weverse-arirang-pob,confirmed,1.0,pob,"特典,预购"`;

export function benefitMapView(opts: {
  text: string;
  notice: string;
  report: BenefitReport | null;
  committed: boolean;
  written: number;
  maps: BenefitMapRow[];
  releases: BenefitReleaseOpt[];
  releaseFilter: string;
  tagsStrict: boolean;
}) {
  const { text, notice, report, committed, written, maps, releases, releaseFilter, tagsStrict } = opts;
  const issueRows =
    report?.issues
      .map(
        (i) => `
        <tr class="${i.level === "error" ? "issue-error" : "issue-warn"}">
          <td>${escapeHtml(i.level)}</td>
          <td>${escapeHtml(i.code)}</td>
          <td>${i.row ?? ""}</td>
          <td>${escapeHtml(i.field || "")}</td>
          <td>${escapeHtml(i.message)}</td>
        </tr>`,
      )
      .join("") || "";
  const mapRows =
    maps
      .map(
        (m) => `
        <tr>
          <td>${escapeHtml(m.groupSlug)}</td>
          <td>${escapeHtml(m.releaseTitle)}</td>
          <td>${escapeHtml(m.versionLabel)}</td>
          <td>${escapeHtml(m.channelCode)}</td>
          <td>${escapeHtml(m.benefitNameZh)}</td>
          <td>${escapeHtml(m.mapsToSlotLabels || "")}</td>
          <td>${escapeHtml(m.mapMode)}</td>
          <td>${escapeHtml(m.status)}</td>
        </tr>`,
      )
      .join("") || "";
  const canCommit = !!report && report.errorCount === 0 && report.rowCount > 0 && !committed;
  return `
    <section class="card">
      <h1>图鉴 · 版本×特典对照</h1>
      <p class="muted">上传运营 Sheet/CSV，按行校验通路词典与卡槽（VB01/VB02）。只把校验通过的 <code>confirmed</code> 行只读落库；<strong>不会</strong>自动 published 无图 Template，也不改图鉴导入。</p>
      ${notice ? `<p class="${committed || /^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <form class="form import-form" id="benefit-form">
        <label>CSV 文件</label>
        <input type="file" id="benefit-file" accept=".csv,text/csv,text/plain" />
        <label>内容</label>
        <textarea name="text" id="benefit-text" rows="12" placeholder="${escapeHtml(BENEFIT_CSV_PLACEHOLDER)}">${escapeHtml(text)}</textarea>
        <label class="check"><input type="checkbox" id="benefit-tags-strict" ${tagsStrict ? "checked" : ""} /> tags_strict（tags_hint 缺失则挡 confirmed）</label>
        <div class="row-actions">
          <button class="btn small" type="submit" id="benefit-validate">校验（不写库）</button>
          <button class="btn small ok" type="button" id="benefit-commit" ${canCommit ? "" : "disabled"}>写入通过的 confirmed 行</button>
        </div>
      </form>
    </section>
    ${
      report
        ? `<section class="card">
            <h2>校验报告</h2>
            <p>${report.ok ? `<span class="ok-msg">通过</span>` : `<span class="err">未通过</span>`}
              · ${report.rowCount} 行 · ${report.errorCount} 个错误 · ${report.warningCount} 个警告
              ${written ? ` · 已写入 ${written}` : ""}</p>
            ${
              report.issues.length
                ? `<div class="table-wrap"><table>
                    <thead><tr><th>级别</th><th>代码</th><th>行</th><th>字段</th><th>说明</th></tr></thead>
                    <tbody>${issueRows}</tbody>
                  </table></div>`
                : `<p class="muted">没有问题项</p>`
            }
          </section>`
        : ""
    }
    <section class="card">
      <h2>已落库对照（只读）</h2>
      <form class="form" id="benefit-filter">
        <label>按发行过滤</label>
        <select id="benefit-release">
          ${option("", "全部发行", releaseFilter)}
          ${releases.map((r) => option(r.id, `${r.groupNameZh ? r.groupNameZh + " · " : ""}${r.title}`, releaseFilter)).join("")}
        </select>
      </form>
      ${
        maps.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>组合</th><th>发行</th><th>版本</th><th>通路</th><th>特典</th><th>卡槽</th><th>模式</th><th>状态</th></tr></thead>
              <tbody>${mapRows}</tbody>
            </table></div>`
          : `<p class="empty">还没有 confirmed 对照。校验通过后可写入。</p>`
      }
    </section>`;
}
