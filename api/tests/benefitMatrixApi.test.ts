import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { sid, GROUP_BTS } from "../src/ids.js";
import { BENEFIT_MAP_DEPRECATED_MESSAGE } from "../src/benefitMatrix.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
const ARIRANG = sid("release:bts:arirang");
const THE_CHASE = sid("release:h2h:the-chase");

type MatrixBody = {
  empty: boolean;
  deprecated?: boolean;
  versions: string[];
  rows: unknown[];
  completeness: { ready: boolean; ratio: number; copy: string };
  release: { id: string; title: string };
};

async function api(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(base + path, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, body, headers: res.headers };
}

async function insertMap(opts: {
  releaseId: string;
  groupId: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
}) {
  await query(
    `INSERT INTO release_benefit_map (
       group_id, release_id, version_label, channel_code, benefit_name_zh,
       maps_to_slot_labels, map_mode, evidence_url, status, benefit_batch,
       version_label_for_template
     ) VALUES ($1,$2,$3,$4,$5,'', 'benefit_only','https://example.invalid/vb-b','confirmed','1.0',NULL)`,
    [opts.groupId, opts.releaseId, opts.versionLabel, opts.channelCode, opts.benefitNameZh],
  );
}

before(async () => {
  await query("DROP SCHEMA public CASCADE");
  await query("CREATE SCHEMA public");
  await seed();
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("guest benefit-matrix is 200 empty + deprecated (not 410)", async () => {
  const res = await api(`/catalog/releases/${THE_CHASE}/benefit-matrix`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.headers.get("deprecation"), "true");
  const body = res.body as MatrixBody;
  assert.equal(body.empty, true);
  assert.equal(body.deprecated, true);
  assert.equal(body.rows.length, 0);
  assert.equal(body.release.id, THE_CHASE);
});

test("ARIRANG matrix stays empty even if map rows exist", async () => {
  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "weverse",
    benefitNameZh: "不应再下发",
  });
  const res = await api(`/catalog/releases/${ARIRANG}/benefit-matrix`);
  assert.equal(res.status, 200);
  const body = res.body as MatrixBody;
  assert.equal(body.empty, true);
  assert.equal(body.deprecated, true);
  assert.equal(body.rows.length, 0);
  assert.equal(body.release.title, "ARIRANG");
});

test("unknown or unpublished release is 404, not 500", async () => {
  const missing = await api("/catalog/releases/00000000-0000-0000-0000-000000000000/benefit-matrix");
  assert.equal(missing.status, 404);

  const draftId = sid("release:vb-b:draft");
  await query(
    `INSERT INTO releases (id, group_id, title, title_zh, aliases, released_on, kind, status)
     VALUES ($1,$2,'Draft Album','草稿','', '2026-01-01','album','draft')`,
    [draftId, GROUP_BTS],
  );
  const hidden = await api(`/catalog/releases/${draftId}/benefit-matrix`);
  assert.equal(hidden.status, 404);
});

test("completeness dashboard path is untouched", async () => {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  assert.equal(login.status, 200);
  const token = (login.body as { token: string }).token;
  const board = await api("/admin/completeness", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(board.status, 200);
  assert.ok(Array.isArray((board.body as { groups: unknown[] }).groups));
});

test("guest library benefits is empty + deprecated", async () => {
  const res = await api("/catalog/benefits");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("deprecation"), "true");
  const body = res.body as { rows: unknown[]; deprecated?: boolean };
  assert.deepEqual(body.rows, []);
  assert.equal(body.deprecated, true);
});

test("release payload itself is not a matrix", async () => {
  const res = await api(`/catalog/releases/${ARIRANG}`);
  assert.equal(res.status, 200);
  const dumped = JSON.stringify(res.body);
  assert.doesNotMatch(dumped, /benefitMatrix|benefit_maps/);
  assert.ok((res.body as { release: { title: string } }).release.title);
});
