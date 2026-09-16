import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { query } from "./db.js";
import { deleteStoredImage } from "./storage.js";

const CATALOG_KEEP_PREFIX = "/media/cards/";

type SqlExec = (text: string, params?: unknown[]) => Promise<unknown>;

function isKeepPath(publicPath: string) {
  return publicPath.startsWith(CATALOG_KEEP_PREFIX) || publicPath.startsWith("/media/logos/");
}

export function collectGcPaths(paths: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = String(raw || "").trim();
    if (!p || seen.has(p) || isKeepPath(p)) continue;
    if (p.startsWith("/media/") || p.includes(`${path.sep}shares${path.sep}`) || p.includes("/shares/")) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export async function enqueueObjectGc(opts: {
  paths: string[];
  reason: string;
  userId?: string | null;
  exec?: SqlExec;
}) {
  const exec = opts.exec || query;
  const paths = collectGcPaths(opts.paths);
  for (const publicPath of paths) {
    await exec(
      `INSERT INTO object_gc_queue (public_path, reason, user_id)
       VALUES ($1, $2, $3)`,
      [publicPath, opts.reason, opts.userId || null],
    );
  }
  return paths.length;
}

async function deleteGcTarget(publicPath: string) {
  if (isKeepPath(publicPath)) return;
  if (publicPath.startsWith("/media/shares/")) {
    const dest = path.join(config.dataDir, "shares", path.basename(publicPath));
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return;
  }
  if (!publicPath.startsWith("/media/") && (publicPath.includes("/shares/") || publicPath.includes(`${path.sep}shares${path.sep}`))) {
    if (fs.existsSync(publicPath)) fs.unlinkSync(publicPath);
    return;
  }
  await deleteStoredImage(publicPath);
}

export async function processObjectGcQueue(limit = 80) {
  const n = Math.min(200, Math.max(1, Number(limit) || 80));
  const r = await query<{ id: string; public_path: string }>(
    `SELECT id, public_path FROM object_gc_queue
     WHERE processed_at IS NULL
     ORDER BY queued_at
     LIMIT $1`,
    [n],
  );
  for (const row of r.rows) {
    try {
      await deleteGcTarget(String(row.public_path));
    } catch {
      // 单条失败不阻断队列；下轮再试
      continue;
    }
    await query("UPDATE object_gc_queue SET processed_at = now() WHERE id = $1", [row.id]);
  }
  return r.rows.length;
}

let gcScheduled = false;

/** Fire-and-forget on the event loop; not a worker thread (OQ-D1 异步 GC). */
export function kickObjectGc() {
  if (gcScheduled) return;
  gcScheduled = true;
  setImmediate(() => {
    gcScheduled = false;
    void processObjectGcQueue().catch(() => {
      /* swallow */
    });
  });
}
