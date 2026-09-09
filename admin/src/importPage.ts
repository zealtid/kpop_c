import { escapeHtml } from "./html";

export type ImportIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type ImportReport = {
  ok: boolean;
  format: string;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: ImportIssue[];
  batches: {
    groupSlug: string;
    releaseTitle: string;
    releasedOn: string;
    kind: string;
    creatingRelease: boolean;
    constrained: boolean;
    templateCount: number;
  }[];
};

const CSV_PLACEHOLDER = `groupSlug,releaseTitle,releasedOn,kind,memberEn,version,status,mainImageUrl,isBenefit,name
bts,ARIRANG,2026-03-20,album,RM,Standard,draft,/media/cards/bts-rm-std.png,false,RM Standard`;

const MD_PLACEHOLDER = `---
groupSlug: bts
releaseTitle: ARIRANG
releasedOn: 2026-03-20
kind: album
---
| memberEn | version | status | mainImageUrl | isBenefit | name |
| --- | --- | --- | --- | --- | --- |
| RM | Standard | draft | /media/cards/bts-rm-std.png | false | RM Standard |`;

export function importView(opts: {
  format: string;
  text: string;
  notice: string;
  report: ImportReport | null;
  committed: boolean;
}) {
  const { format, text, notice, report, committed } = opts;
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
  const batchRows =
    report?.batches
      .map(
        (b) => `
        <tr>
          <td>${escapeHtml(b.groupSlug)}</td>
          <td>${escapeHtml(b.releaseTitle)}</td>
          <td>${escapeHtml(b.kind)}</td>
          <td>${b.templateCount}</td>
          <td>${b.creatingRelease ? "将新建发行" : "已有发行"}</td>
          <td>${b.constrained ? "受切片约束" : "—"}</td>
        </tr>`,
      )
      .join("") || "";
  const canCommit = !!report && report.ok && !committed;
  return `
    <section class="card">
      <h1>图鉴 · 导入校验</h1>
      <p class="muted">支持 JSON / CSV / Markdown 表格。先出校验报告，确认无错误再写入。失败会留在本页，不会静默吞掉。</p>
      ${notice ? `<p class="${committed || /^已/.test(notice) ? "ok-msg" : "err"}" id="catalog-notice">${escapeHtml(notice)}</p>` : ""}
      <form class="form import-form" id="import-form">
        <label>格式</label>
        <select name="format" id="import-format">
          <option value="csv" ${format === "csv" ? "selected" : ""}>CSV</option>
          <option value="markdown" ${format === "markdown" ? "selected" : ""}>Markdown 表格</option>
          <option value="json" ${format === "json" ? "selected" : ""}>JSON（兼容 POST /admin/import）</option>
        </select>
        <label>内容</label>
        <textarea name="text" id="import-text" rows="12" placeholder="${escapeHtml(format === "markdown" ? MD_PLACEHOLDER : CSV_PLACEHOLDER)}">${escapeHtml(text)}</textarea>
        <div class="row-actions">
          <button class="btn small" type="submit" id="import-validate">校验（不写库）</button>
          <button class="btn small ok" type="button" id="import-commit" ${canCommit ? "" : "disabled"}>写入数据库</button>
        </div>
      </form>
    </section>
    ${
      report
        ? `<section class="card">
            <h2>校验报告</h2>
            <p>${report.ok ? `<span class="ok-msg">通过</span>` : `<span class="err">未通过</span>`}
              · ${report.rowCount} 行 · ${report.errorCount} 个错误 · ${report.warningCount} 个警告
              · 格式 ${escapeHtml(report.format)}</p>
            ${
              report.batches.length
                ? `<div class="table-wrap"><table>
                    <thead><tr><th>组合</th><th>发行</th><th>kind</th><th>模板</th><th>发行</th><th>约束</th></tr></thead>
                    <tbody>${batchRows}</tbody>
                  </table></div>`
                : ""
            }
            ${
              report.issues.length
                ? `<div class="table-wrap" style="margin-top:12px"><table>
                    <thead><tr><th>级别</th><th>代码</th><th>行</th><th>字段</th><th>说明</th></tr></thead>
                    <tbody>${issueRows}</tbody>
                  </table></div>`
                : `<p class="muted">没有问题项</p>`
            }
          </section>`
        : ""
    }`;
}

export function importPlaceholder(format: string) {
  return format === "markdown" ? MD_PLACEHOLDER : format === "json" ? `{
  "groupSlug": "bts",
  "releaseTitle": "ARIRANG",
  "releasedOn": "2026-03-20",
  "kind": "album",
  "templates": []
}` : CSV_PLACEHOLDER;
}

export function buildImportBody(format: string, text: string, dryRun: boolean) {
  if (format === "json") {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { format: "json", text, parseError: true };
    }
    if (parsed.parseError) return { format: "json", text, dryRun };
    return { ...parsed, dryRun };
  }
  return { format, text, dryRun };
}
