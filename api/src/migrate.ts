import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const dir = path.resolve(here, "../migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (applied.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await query(sql);
    await query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
    console.log(`applied ${file}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(async () => {
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
