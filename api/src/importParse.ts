export type ImportTemplateRow = {
  row: number;
  groupSlug: string;
  releaseTitle: string;
  releaseTitleZh?: string;
  releasedOn: string;
  kind?: string;
  memberEn?: string;
  version: string;
  name?: string;
  isBenefit?: boolean;
  isDeprecated?: boolean;
  status?: string;
  mainImageUrl?: string | null;
  code?: string;
};

export type ParseIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type ParsedImport = {
  format: "json" | "csv" | "markdown";
  rows: ImportTemplateRow[];
  issues: ParseIssue[];
};

const HEADER_ALIASES: Record<string, string> = {
  groupslug: "groupSlug",
  group_slug: "groupSlug",
  releasetitle: "releaseTitle",
  release_title: "releaseTitle",
  releasetitlezh: "releaseTitleZh",
  release_title_zh: "releaseTitleZh",
  releasedon: "releasedOn",
  released_on: "releasedOn",
  kind: "kind",
  memberen: "memberEn",
  member_en: "memberEn",
  version: "version",
  name: "name",
  isbenefit: "isBenefit",
  is_benefit: "isBenefit",
  isdeprecated: "isDeprecated",
  is_deprecated: "isDeprecated",
  status: "status",
  mainimageurl: "mainImageUrl",
  main_image_url: "mainImageUrl",
  code: "code",
};

function normHeader(h: string) {
  return HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, "_")] || "";
}

function asBool(v: unknown): boolean | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "是"].includes(s)) return true;
  if (["0", "false", "no", "n", "否"].includes(s)) return false;
  return undefined;
}

function str(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function rowFromRecord(rec: Record<string, unknown>, row: number, defaults: Record<string, string> = {}): ImportTemplateRow {
  const get = (k: string) => str(rec[k] ?? defaults[k]);
  const statusRaw = get("status").toLowerCase();
  const status = statusRaw === "published" || statusRaw === "draft" ? statusRaw : statusRaw ? statusRaw : undefined;
  const kind = get("kind");
  return {
    row,
    groupSlug: get("groupSlug"),
    releaseTitle: get("releaseTitle"),
    releaseTitleZh: get("releaseTitleZh") || undefined,
    releasedOn: get("releasedOn"),
    kind: kind || undefined,
    memberEn: get("memberEn") || undefined,
    version: get("version"),
    name: get("name") || undefined,
    isBenefit: asBool(rec.isBenefit ?? rec.is_benefit ?? defaults.isBenefit),
    isDeprecated: asBool(rec.isDeprecated ?? rec.is_deprecated ?? defaults.isDeprecated),
    status,
    mainImageUrl: get("mainImageUrl") || null,
    code: get("code") || undefined,
  };
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  const pushCell = () => {
    row.push(cur.trim());
    cur = "";
  };
  const pushRow = () => {
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushCell();
    else if (c === "\n") {
      pushCell();
      pushRow();
    } else if (c === "\r") continue;
    else cur += c;
  }
  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

function recordsFromGrid(grid: string[][], issues: ParseIssue[]): ImportTemplateRow[] {
  if (!grid.length) {
    issues.push({ level: "error", code: "EMPTY_BATCH", message: "没有可导入的行" });
    return [];
  }
  const headers = grid[0].map(normHeader);
  if (!headers.some(Boolean)) {
    issues.push({ level: "error", code: "BAD_HEADER", message: "无法识别表头，需要 groupSlug / releaseTitle / version 等列" });
    return [];
  }
  const rows: ImportTemplateRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = cells[idx] ?? "";
    });
    rows.push(rowFromRecord(rec, i + 1));
  }
  return rows;
}

function parseFrontMatter(text: string): { meta: Record<string, string>; body: string } {
  const m = String(text || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const eq = line.indexOf(":");
    if (eq < 0) continue;
    const key = normHeader(line.slice(0, eq));
    if (!key) continue;
    meta[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

function parseMarkdownTables(body: string): string[][] {
  const lines = body.split(/\n/);
  const grid: string[][] = [];
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    grid.push(cells);
  }
  return grid;
}

export function parseMarkdownImport(text: string, issues: ParseIssue[]): ImportTemplateRow[] {
  const { meta, body } = parseFrontMatter(text);
  const grid = parseMarkdownTables(body);
  if (!grid.length) {
    issues.push({ level: "error", code: "EMPTY_BATCH", message: "Markdown 中没有表格" });
    return [];
  }
  const rows = recordsFromGrid(grid, issues);
  return rows.map((r) => ({
    ...r,
    groupSlug: r.groupSlug || meta.groupSlug || "",
    releaseTitle: r.releaseTitle || meta.releaseTitle || "",
    releaseTitleZh: r.releaseTitleZh || meta.releaseTitleZh || undefined,
    releasedOn: r.releasedOn || meta.releasedOn || "",
    kind: r.kind || meta.kind || undefined,
  }));
}

function jsonTemplatesToRows(body: Record<string, unknown>, startRow = 1): ImportTemplateRow[] {
  const templates = Array.isArray(body.templates) ? body.templates : [];
  const defaults = {
    groupSlug: str(body.groupSlug),
    releaseTitle: str(body.releaseTitle),
    releaseTitleZh: str(body.releaseTitleZh),
    releasedOn: str(body.releasedOn),
    kind: str(body.kind),
  };
  if (!templates.length) {
    return [rowFromRecord({ ...defaults, version: str(body.version), memberEn: str(body.memberEn) }, startRow, defaults)];
  }
  return templates.map((t, i) => {
    const rec = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
    return rowFromRecord(
      {
        ...defaults,
        ...rec,
        memberEn: rec.memberEn ?? rec.member_en,
        isBenefit: rec.isBenefit ?? rec.is_benefit,
        isDeprecated: rec.isDeprecated ?? rec.is_deprecated,
        mainImageUrl: rec.mainImageUrl ?? rec.main_image_url,
      },
      startRow + i,
      defaults,
    );
  });
}

export function parseImportInput(body: unknown): ParsedImport {
  const issues: ParseIssue[] = [];
  if (!body || typeof body !== "object") {
    issues.push({ level: "error", code: "BAD_BODY", message: "请求体不能为空" });
    return { format: "json", rows: [], issues };
  }
  const raw = body as Record<string, unknown>;
  const formatRaw = str(raw.format).toLowerCase();
  const text = str(raw.text);
  let format: ParsedImport["format"] = "json";
  if (formatRaw === "csv" || formatRaw === "markdown" || formatRaw === "md") {
    format = formatRaw === "csv" ? "csv" : "markdown";
  } else if (!formatRaw && text && !raw.groupSlug && !raw.templates) {
    format = text.includes("|") ? "markdown" : "csv";
  }

  let rows: ImportTemplateRow[] = [];
  if (format === "csv") {
    if (!text) issues.push({ level: "error", code: "MISSING_TEXT", message: "CSV 导入需要 text 字段" });
    else rows = recordsFromGrid(parseCsvText(text), issues);
  } else if (format === "markdown") {
    if (!text) issues.push({ level: "error", code: "MISSING_TEXT", message: "Markdown 导入需要 text 字段" });
    else rows = parseMarkdownImport(text, issues);
  } else if (Array.isArray(raw.batches)) {
    raw.batches.forEach((b, i) => {
      if (b && typeof b === "object") rows.push(...jsonTemplatesToRows(b as Record<string, unknown>, i * 1000 + 1));
    });
  } else {
    rows = jsonTemplatesToRows(raw, 1);
  }

  rows = rows.filter((r) => r.groupSlug || r.releaseTitle || r.version || r.memberEn);
  if (!rows.length && !issues.some((i) => i.code === "EMPTY_BATCH" || i.code === "MISSING_TEXT" || i.code === "BAD_BODY")) {
    issues.push({ level: "error", code: "EMPTY_BATCH", message: "没有可导入的模板行" });
  }
  return { format, rows, issues };
}

export function isDryRun(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const raw = body as Record<string, unknown>;
  if (raw.dryRun === true || raw.commit === false) return true;
  if (raw.dryRun === false || raw.commit === true) return false;
  return false;
}
