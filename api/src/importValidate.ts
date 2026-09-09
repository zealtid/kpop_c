import { query } from "./db.js";
import { AppError, badRequest } from "./errors.js";
import { importCatalog, templateDedupeKey, type ImportBody } from "./admin.js";
import { allowedReleaseIdsFor } from "./catalogConstraints.js";
import { isReleaseKind, normalizeReleaseKind } from "./catalogConstants.js";
import {
  isDryRun,
  parseImportInput,
  type ImportTemplateRow,
  type ParseIssue,
  type ParsedImport,
} from "./importParse.js";

export type ValidationIssue = ParseIssue;

export type ImportReport = {
  ok: boolean;
  format: ParsedImport["format"];
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
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

function issue(level: ValidationIssue["level"], code: string, message: string, row?: number, field?: string): ValidationIssue {
  return { level, code, message, row, field };
}

function groupRows(rows: ImportTemplateRow[]) {
  const map = new Map<string, ImportTemplateRow[]>();
  for (const row of rows) {
    const key = `${row.groupSlug}\0${row.releaseTitle}`;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.values()];
}

async function validateRows(parsed: ParsedImport): Promise<{ report: ImportReport; bodies: ImportBody[] }> {
  const issues: ValidationIssue[] = [...parsed.issues];
  const bodies: ImportBody[] = [];
  const batches: ImportReport["batches"] = [];

  if (!parsed.rows.length) {
    const errorCount = issues.filter((i) => i.level === "error").length;
    return {
      report: {
        ok: false,
        format: parsed.format,
        rowCount: 0,
        errorCount: Math.max(errorCount, 1),
        warningCount: issues.filter((i) => i.level === "warning").length,
        issues: errorCount ? issues : [...issues, issue("error", "EMPTY_BATCH", "没有可导入的模板行")],
        batches: [],
      },
      bodies: [],
    };
  }

  const groups = await query("SELECT id, slug FROM idol_groups");
  const slugToId = new Map(groups.rows.map((g) => [String(g.slug).toLowerCase(), String(g.id)]));
  const members = await query("SELECT group_id, name_en FROM members");
  const memberKeys = new Set(members.rows.map((m) => `${String(m.group_id)}\0${String(m.name_en)}`));
  const releases = await query(
    `SELECT r.id, r.title, g.slug FROM releases r JOIN idol_groups g ON g.id = r.group_id`,
  );
  const releaseBySlugTitle = new Map(
    releases.rows.map((r) => [`${String(r.slug).toLowerCase()}\0${String(r.title)}`, String(r.id)]),
  );

  const seenDedupe = new Set<string>();

  for (const groupRowsList of groupRows(parsed.rows)) {
    const head = groupRowsList[0];
    const slug = head.groupSlug.toLowerCase();
    const groupId = slugToId.get(slug);
    if (!head.groupSlug) {
      for (const row of groupRowsList) issues.push(issue("error", "MISSING_FIELD", "缺少 groupSlug", row.row, "groupSlug"));
    } else if (!groupId) {
      for (const row of groupRowsList) {
        issues.push(issue("error", "GROUP_NOT_FOUND", `组合不存在：${head.groupSlug}`, row.row, "groupSlug"));
      }
    }
    if (!head.releaseTitle) {
      for (const row of groupRowsList) issues.push(issue("error", "MISSING_FIELD", "缺少 releaseTitle", row.row, "releaseTitle"));
    }
    const releasedOn = groupRowsList.find((r) => r.releasedOn)?.releasedOn || "";
    if (!releasedOn || !/^\d{4}-\d{2}-\d{2}$/.test(releasedOn)) {
      for (const row of groupRowsList) {
        issues.push(issue("error", "INVALID_DATE", "releasedOn 必须是 YYYY-MM-DD", row.row, "releasedOn"));
      }
    }
    const kindRaw = groupRowsList.find((r) => r.kind)?.kind;
    const kind = normalizeReleaseKind(kindRaw, "album");
    if (kindRaw && !isReleaseKind(kindRaw)) {
      for (const row of groupRowsList) {
        issues.push(issue("error", "INVALID_KIND", "kind 必须是 album | single | mini | concert_md", row.row, "kind"));
      }
    }
    const existingId = releaseBySlugTitle.get(`${slug}\0${head.releaseTitle}`) || null;
    const creating = !existingId;
    const allow = allowedReleaseIdsFor(slug);
    if (allow) {
      if (creating) {
        for (const row of groupRowsList) {
          issues.push(
            issue(
              "error",
              "CATALOG_CONSTRAINT",
              `组合 ${head.groupSlug} 仅允许已配置的发行切片，禁止导入扩展新专辑`,
              row.row,
              "releaseTitle",
            ),
          );
        }
      } else if (existingId && !allow.includes(existingId)) {
        for (const row of groupRowsList) {
          issues.push(
            issue("error", "CATALOG_CONSTRAINT", `发行不在 ${head.groupSlug} 允许的 release_id 切片内`, row.row, "releaseTitle"),
          );
        }
      }
    }

    const templates: ImportBody["templates"] = [];
    for (const row of groupRowsList) {
      if (!row.version) issues.push(issue("error", "MISSING_FIELD", "模板缺少 version", row.row, "version"));
      const status = row.status || "draft";
      if (status !== "draft" && status !== "published") {
        issues.push(issue("error", "INVALID_STATUS", "status 只能是 draft 或 published", row.row, "status"));
      }
      if (status === "published" && !row.mainImageUrl) {
        issues.push(issue("error", "IMAGE_REQUIRED", "未设置主图的模板不能发布", row.row, "mainImageUrl"));
      }
      if (row.memberEn && groupId) {
        const found = memberKeys.has(`${groupId}\0${row.memberEn}`);
        if (!found) {
          issues.push(issue("error", "MEMBER_NOT_FOUND", `成员不存在：${row.memberEn}`, row.row, "memberEn"));
        }
      }
      const dedupe = templateDedupeKey(head.groupSlug, head.releaseTitle, row.memberEn, row.version || "");
      if (row.version && seenDedupe.has(dedupe)) {
        issues.push(issue("error", "DUPLICATE_DEDUPE_KEY", `批次内去重键重复：${dedupe}`, row.row, "version"));
      }
      if (row.version) seenDedupe.add(dedupe);
      templates.push({
        code: row.code,
        memberEn: row.memberEn,
        version: row.version,
        isBenefit: row.isBenefit,
        isDeprecated: row.isDeprecated,
        status: status === "published" ? "published" : "draft",
        mainImageUrl: row.mainImageUrl,
        name: row.name,
      });
    }

    batches.push({
      groupSlug: head.groupSlug,
      releaseTitle: head.releaseTitle,
      releasedOn,
      kind: kind || "album",
      creatingRelease: creating,
      constrained: !!allow,
      templateCount: templates.length,
    });
    if (head.groupSlug && head.releaseTitle && releasedOn) {
      bodies.push({
        groupSlug: head.groupSlug,
        releaseTitle: head.releaseTitle,
        releaseTitleZh: head.releaseTitleZh,
        releasedOn,
        kind: kind || "album",
        templates,
      });
    }
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;
  return {
    report: {
      ok: errorCount === 0 && bodies.length > 0,
      format: parsed.format,
      rowCount: parsed.rows.length,
      errorCount,
      warningCount,
      issues,
      batches,
    },
    bodies,
  };
}

export async function previewOrCommitImport(body: unknown) {
  const dryRun = isDryRun(body);
  const parsed = parseImportInput(body);
  const { report, bodies } = await validateRows(parsed);
  if (dryRun) {
    return { committed: false, report };
  }
  if (!report.ok) {
    throw new AppError(400, "IMPORT_INVALID", "导入校验未通过", report);
  }
  const results = [];
  for (const batch of bodies) {
    results.push(await importCatalog(batch));
  }
  const first = results[0];
  return {
    committed: true,
    report,
    results,
    releaseId: first?.releaseId,
    upserted: results.length === 1 ? first?.upserted : results.flatMap((r) => r.upserted),
    count: results.reduce((n, r) => n + r.count, 0),
  };
}
