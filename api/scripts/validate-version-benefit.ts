#!/usr/bin/env npx tsx
/**
 * 版本×特典对照 CSV 校验 CLI。
 * 有错误时打印逐行列表并以非 0 退出。
 *
 *   npx tsx scripts/validate-version-benefit.ts fixtures/version_benefit_map.sample.csv
 *   npx tsx scripts/validate-version-benefit.ts --tags-strict --no-db path/to.csv
 */
import fs from "node:fs";
import path from "node:path";
import { loadChannelDictionary } from "../src/channelDictionary.js";
import { parseBenefitCsv } from "../src/versionBenefitParse.js";
import { compileBenefitReport, validateBenefitRows, type CatalogSnapshot } from "../src/versionBenefitValidate.js";

function printHelp() {
  console.log(`用法: validate-version-benefit [--tags-strict] [--no-db] <csv>
失败时列出逐行错误并以 exit 1 结束。默认尝试 DATABASE_URL 加载图鉴快照。`);
}

async function loadCatalog(tagsStrict: boolean): Promise<CatalogSnapshot> {
  const { loadCatalogSnapshot } = await import("../src/versionBenefit.js");
  return loadCatalogSnapshot(tagsStrict);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help") || !args.length) {
    printHelp();
    process.exit(args.length ? 0 : 2);
  }
  const tagsStrict = args.includes("--tags-strict");
  const noDb = args.includes("--no-db");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    printHelp();
    process.exit(2);
  }
  const csvPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(csvPath)) {
    console.error(`找不到文件：${csvPath}`);
    process.exit(2);
  }
  const text = fs.readFileSync(csvPath, "utf8");
  const parsed = parseBenefitCsv(text);
  const dict = loadChannelDictionary();
  let catalog: CatalogSnapshot = {
    groups: [],
    releases: [],
    members: [],
    templates: [],
    tagsStrict,
  };
  if (!noDb) {
    try {
      catalog = await loadCatalog(tagsStrict);
    } catch (err) {
      console.error("无法加载图鉴快照（将只做词典/表结构校验）:", (err as Error).message);
    }
  }
  const results = validateBenefitRows(parsed.rows, { dict, catalog });
  const report = compileBenefitReport(parsed.issues, results);
  for (const issue of report.issues) {
    const loc = [issue.row != null ? `L${issue.row}` : "", issue.field || ""].filter(Boolean).join(" ");
    console.log(`${issue.level === "error" ? "ERR" : "WARN"}\t${issue.code}\t${loc}\t${issue.message}`);
  }
  console.log(
    `${report.ok ? "OK" : "FAIL"} rows=${report.rowCount} errors=${report.errorCount} warnings=${report.warningCount}`,
  );
  process.exit(report.errorCount === 0 && parsed.rows.length > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
