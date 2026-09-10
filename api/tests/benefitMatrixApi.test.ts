import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { sid, GROUP_BTS } from "../src/ids.js";
import { BENEFIT_MATRIX_INCOMPLETE_COPY, BENEFIT_MATRIX_READY_COPY } from "../src/benefitMatrix.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
const ARIRANG = sid("release:bts:arirang");
const THE_CHASE = sid("release:h2h:the-chase");

type MatrixBody = {
  empty: boolean;
  versions: string[];
  rows: {
    id: string;
    benefitNameZh: string;
    channelNameZh: string;
    benefitBatch: string | null;
    mapMode: string;
    versionLabel: string;
    slots: {
      label: string;
      version: string;
      templateId: string | null;
      templateStatus: string;
      navigable: boolean;
      imageUrl: string | null;
    }[];
  }[];
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
  return { status: res.status, body };
}

async function insertMap(opts: {
  releaseId: string;
  groupId: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
  mapsToSlotLabels?: string | null;
  mapMode?: string;
  status?: string;
  versionLabelForTemplate?: string | null;
}) {
  await query(
    `INSERT INTO release_benefit_map (
       group_id, release_id, version_label, channel_code, benefit_name_zh,
       maps_to_slot_labels, map_mode, evidence_url, status, benefit_batch,
       version_label_for_template
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'https://example.invalid/vb-b',$8,'1.0',$9)`,
    [
      opts.groupId,
      opts.releaseId,
      opts.versionLabel,
      opts.channelCode,
      opts.benefitNameZh,
      opts.mapsToSlotLabels ?? null,
      opts.mapMode || "slots",
      opts.status || "confirmed",
      opts.versionLabelForTemplate ?? null,
    ],
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

test("guest can read benefit-matrix; W1 empty confirmed is 200 + empty", async () => {
  const res = await api(`/catalog/releases/${THE_CHASE}/benefit-matrix`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body as MatrixBody;
  assert.equal(body.empty, true);
  assert.equal(body.rows.length, 0);
  assert.ok(Array.isArray(body.versions) && body.versions.length > 0);
  assert.equal(body.completeness.ready, false);
  assert.equal(body.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
  assert.doesNotMatch(body.completeness.copy, /已凑齐全部特典/);
});

test("ARIRANG with no confirmed maps is stable empty (prod-like)", async () => {
  const res = await api(`/catalog/releases/${ARIRANG}/benefit-matrix`);
  assert.equal(res.status, 200);
  const body = res.body as MatrixBody;
  assert.equal(body.empty, true);
  assert.equal(body.release.title, "ARIRANG");
  assert.ok(body.versions.some((v) => /standard/i.test(v)));
  assert.equal(body.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
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

test("published mapping is navigable; draft/missing 待补 and leak no fake image", async () => {
  const pub = await query(
    `SELECT id, name, version, main_image_url FROM templates
     WHERE release_id = $1 AND status = 'published' AND is_deprecated = false
     ORDER BY name LIMIT 1`,
    [ARIRANG],
  );
  const pubTpl = pub.rows[0];
  assert.ok(pubTpl, "seed should have a published ARIRANG template");

  const draftTplId = sid("tpl:vb-b:draft-slot");
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,NULL,'VB-B-DRAFT','刀B草稿槽','Standard',true,false,'draft','/media/cards/fake-draft.png','vb-b:draft-slot')`,
    [draftTplId, ARIRANG],
  );

  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "weverse",
    benefitNameZh: "已发布映射",
    mapsToSlotLabels: String(pubTpl.name),
    versionLabelForTemplate: String(pubTpl.version),
  });
  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "ktown4u",
    benefitNameZh: "草稿映射",
    mapsToSlotLabels: "刀B草稿槽",
    versionLabelForTemplate: "Standard",
  });
  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "yes24",
    benefitNameZh: "缺失映射",
    mapsToSlotLabels: "不存在的卡槽-刀B",
    versionLabelForTemplate: "Standard",
  });
  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "makestar",
    benefitNameZh: "起草不进矩阵",
    mapsToSlotLabels: String(pubTpl.name),
    status: "drafting",
    versionLabelForTemplate: String(pubTpl.version),
  });

  const res = await api(`/catalog/releases/${ARIRANG}/benefit-matrix`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body as MatrixBody;
  assert.equal(body.empty, false);
  assert.equal(body.rows.length, 3);
  assert.ok(!body.rows.some((r) => r.benefitNameZh === "起草不进矩阵"));

  const published = body.rows.find((r) => r.benefitNameZh === "已发布映射");
  const draft = body.rows.find((r) => r.benefitNameZh === "草稿映射");
  const missing = body.rows.find((r) => r.benefitNameZh === "缺失映射");
  assert.ok(published && draft && missing);
  assert.equal(published.channelNameZh, "Weverse Shop");
  assert.equal(published.mapMode, "slots");
  assert.equal(published.slots[0].templateStatus, "published");
  assert.equal(published.slots[0].navigable, true);
  assert.equal(published.slots[0].templateId, String(pubTpl.id));
  assert.equal(published.slots[0].imageUrl, pubTpl.main_image_url);

  assert.equal(draft.slots[0].templateStatus, "draft");
  assert.equal(draft.slots[0].navigable, false);
  assert.equal(draft.slots[0].imageUrl, null);

  assert.equal(missing.slots[0].templateStatus, "missing");
  assert.equal(missing.slots[0].navigable, false);
  assert.equal(missing.slots[0].templateId, null);
  assert.equal(missing.slots[0].imageUrl, null);

  assert.equal(body.completeness.ready, false);
  assert.equal(body.completeness.copy, BENEFIT_MATRIX_INCOMPLETE_COPY);
  assert.notEqual(body.completeness.copy, BENEFIT_MATRIX_READY_COPY);

  const dumped = JSON.stringify(body);
  assert.doesNotMatch(dumped, /fake-draft\.png/);
  assert.doesNotMatch(dumped, /placeholder|dummy-card|fake-image/i);
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

test("H2H guest matrix does not 500 when table has only other-release maps", async () => {
  await insertMap({
    releaseId: ARIRANG,
    groupId: GROUP_BTS,
    versionLabel: "standard",
    channelCode: "aladin",
    benefitNameZh: "只属于 ARIRANG",
    mapsToSlotLabels: "",
    mapMode: "benefit_only",
  });
  const res = await api(`/catalog/releases/${THE_CHASE}/benefit-matrix`);
  assert.equal(res.status, 200);
  assert.equal((res.body as MatrixBody).empty, true);
  assert.equal((res.body as MatrixBody).release.id, THE_CHASE);
});
