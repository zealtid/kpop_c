import { api, errorMessage } from "../api";

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

export const CSV_PLACEHOLDER = `groupSlug,releaseTitle,releasedOn,kind,memberEn,version,status,mainImageUrl,isBenefit,name
bts,ARIRANG,2026-03-20,album,RM,Standard,draft,/media/cards/bts-rm-std.png,false,RM Standard`;

export const MD_PLACEHOLDER = `---
groupSlug: bts
releaseTitle: ARIRANG
releasedOn: 2026-03-20
kind: album
---
| memberEn | version | status | mainImageUrl | isBenefit | name |
| --- | --- | --- | --- | --- | --- |
| RM | Standard | draft | /media/cards/bts-rm-std.png | false | RM Standard |`;

export const JSON_PLACEHOLDER = `{
  "groupSlug": "bts",
  "releaseTitle": "ARIRANG",
  "releasedOn": "2026-03-20",
  "kind": "album",
  "templates": []
}`;

export function importPlaceholder(format: string) {
  if (format === "markdown") return MD_PLACEHOLDER;
  if (format === "json") return JSON_PLACEHOLDER;
  return CSV_PLACEHOLDER;
}

export function buildImportBody(format: string, text: string, dryRun: boolean) {
  if (format === "json") {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { format: "json", text, dryRun };
    }
    return { ...parsed, dryRun };
  }
  return { format, text, dryRun };
}

export type ImportResponse = {
  committed?: boolean;
  report?: ImportReport;
  count?: number;
  error?: { message?: string; details?: ImportReport };
};

export async function validateImport(format: string, text: string) {
  return api<ImportResponse>("/admin/import/validate", {
    method: "POST",
    body: JSON.stringify(buildImportBody(format, text, true)),
  });
}

export async function commitImport(format: string, text: string) {
  return api<ImportResponse>("/admin/import", {
    method: "POST",
    body: JSON.stringify(buildImportBody(format, text, false)),
  });
}

export function importNotice(res: { status: number; body: ImportResponse }, fallback: string) {
  return errorMessage(res.body, fallback);
}

export function importReportFrom(res: { status: number; body: ImportResponse }): ImportReport | null {
  if (res.body.report) return res.body.report;
  return res.body.error?.details || null;
}
