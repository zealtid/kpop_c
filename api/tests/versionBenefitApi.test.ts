import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { sid } from "../src/ids.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
const ARIRANG = sid("release:bts:arirang");

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

async function opsToken() {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return (login.body as { token: string }).token;
}

function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

type ReportBody = {
  committed: boolean;
  written?: number;
  report: {
    ok: boolean;
    errorCount: number;
    issues: { code: string; row?: number }[];
  };
  maps?: { id: string; releaseId: string; channelCode: string; status: string }[];
};

const PASS_CSV = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status,benefit_batch,benefit_type,tags_hint
bts,bts-arirang,standard,WV,预购特典 Weverse,预购特典 Weverse,slots,https://example.invalid/weverse-arirang-pob,confirmed,1.0,pob,"特典,预购"`;

before(async () => {
  await query("DROP SCHEMA public CASCADE");
  await query("CREATE SCHEMA public");
  await seed();
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,NULL,'VB-SLOT-WEVERSE','预购特典 Weverse','Standard',true,false,'draft',NULL,'vb:arirang:weverse-slot')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [sid("tpl:vb:weverse-slot"), ARIRANG],
  );
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("version-benefit APIs require ops allowlist", async () => {
  assert.equal((await api("/admin/version-benefit/channels")).status, 401);
  assert.equal((await api("/admin/version-benefit/maps")).status, 401);
  assert.equal((await api("/admin/version-benefit/validate", { method: "POST", body: "{}" })).status, 401);
  const wx = await api("/auth/wx-login", { method: "POST", body: JSON.stringify({ code: "mock:vb-wx" }) });
  const wxTok = (wx.body as { token: string }).token;
  assert.equal(
    (await api("/admin/version-benefit/validate", { method: "POST", headers: { Authorization: `Bearer ${wxTok}` }, body: "{}" }))
      .status,
    401,
  );
});

test("validate sample-like CSV reports E_SLOT_MISS without matching template name", async () => {
  const token = await opsToken();
  const csv = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status
bts,bts-arirang,standard,weverse,其他特典,不存在的卡槽,slots,https://example.invalid/x,confirmed`;
  const res = await api("/admin/version-benefit/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: csv }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body as ReportBody;
  assert.equal(body.committed, false);
  assert.ok(body.report.issues.some((i) => i.code === "E_SLOT_MISS"));
});

test("import with any row error returns 4xx and writes nothing", async () => {
  const token = await opsToken();
  const before = await query("SELECT count(*)::int AS n FROM release_benefit_map");
  const mixed = `${PASS_CSV}
bts,bts-arirang,standard,weverse,坏行,不存在的卡槽,slots,https://example.invalid/x,confirmed`;
  const res = await api("/admin/version-benefit/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: mixed }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  const err = res.body as { error: { code: string; details?: { ok: boolean; errorCount: number } } };
  assert.equal(err.error.code, "IMPORT_INVALID");
  assert.ok((err.error.details?.errorCount || 0) > 0);
  assert.equal(err.error.details?.ok, false);
  const after = await query("SELECT count(*)::int AS n FROM release_benefit_map");
  assert.equal(after.rows[0].n, before.rows[0].n);
});

test("validate + persist confirmed row; list by release; no imageless publish", async () => {
  const token = await opsToken();
  const beforeTpl = await query("SELECT status, main_image_url FROM templates WHERE dedupe_key = $1", [
    "vb:arirang:weverse-slot",
  ]);
  assert.equal(beforeTpl.rows[0].status, "draft");
  assert.equal(beforeTpl.rows[0].main_image_url, null);

  const validated = await api("/admin/version-benefit/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: PASS_CSV }),
  });
  assert.equal(validated.status, 200, JSON.stringify(validated.body));
  const vbody = validated.body as ReportBody;
  assert.equal(vbody.report.ok, true, JSON.stringify(vbody.report.issues));
  assert.equal(vbody.committed, false);

  const imported = await api("/admin/version-benefit/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: PASS_CSV }),
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  const ibody = imported.body as ReportBody;
  assert.equal(ibody.written, 1);
  assert.equal(ibody.maps?.[0].channelCode, "weverse");
  assert.equal(ibody.maps?.[0].status, "confirmed");
  assert.equal(ibody.maps?.[0].releaseId, ARIRANG);

  const listed = await api(`/admin/version-benefit/maps?releaseId=${ARIRANG}`, { headers: auth(token) });
  assert.equal(listed.status, 200);
  const maps = (listed.body as { maps: { releaseId: string; groupSlug: string }[] }).maps;
  assert.equal(maps.length, 1);
  assert.equal(maps[0].groupSlug, "bts");

  const other = await api(`/admin/version-benefit/maps?releaseId=${sid("release:h2h:the-chase")}`, {
    headers: auth(token),
  });
  assert.equal((other.body as { maps: unknown[] }).maps.length, 0);

  const afterTpl = await query("SELECT status, main_image_url FROM templates WHERE dedupe_key = $1", [
    "vb:arirang:weverse-slot",
  ]);
  assert.equal(afterTpl.rows[0].status, "draft");
  assert.equal(afterTpl.rows[0].main_image_url, null);

  const channels = await api("/admin/version-benefit/channels", { headers: auth(token) });
  assert.equal(channels.status, 200);
  assert.ok(((channels.body as { channels: { code: string }[] }).channels || []).some((c) => c.code === "unknown"));

  // completeness path still answers (we did not change it)
  const board = await api("/admin/completeness", { headers: auth(token) });
  assert.equal(board.status, 200);
  assert.ok(Array.isArray((board.body as { groups: unknown[] }).groups));

});

test("benefit_only confirmed persists without slot template", async () => {
  const token = await opsToken();
  const csv = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status
bts,bts-arirang,standard,yes24,未拆卡 Yes24,,benefit_only,https://example.invalid/yes24,confirmed`;
  const res = await api("/admin/version-benefit/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: csv }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((res.body as ReportBody).written, 1);
  assert.equal((res.body as ReportBody).maps?.[0].channelCode, "yes24");
});
