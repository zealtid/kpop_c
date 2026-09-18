import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { sid } from "../src/ids.js";
import { BENEFIT_MAP_DEPRECATED_MESSAGE } from "../src/benefitMatrix.js";
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
  return { status: res.status, body, headers: res.headers };
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

type DeprecatedBody = {
  deprecated?: boolean;
  committed?: boolean;
  written?: number;
  maps?: unknown[];
  message?: string;
  report?: { ok: boolean; errorCount: number; issues: { code: string }[] };
};

const PASS_CSV = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status,benefit_batch,benefit_type,tags_hint
bts,bts-arirang,standard,WV,预购特典 Weverse,预购特典 Weverse,slots,https://example.invalid/weverse-arirang-pob,confirmed,1.0,pob,"特典,预购"`;

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

test("map read/import/validate are empty + deprecated and write nothing", async () => {
  const token = await opsToken();
  const before = await query("SELECT count(*)::int AS n FROM release_benefit_map");

  const validated = await api("/admin/version-benefit/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: PASS_CSV }),
  });
  assert.equal(validated.status, 200, JSON.stringify(validated.body));
  assert.equal(validated.headers.get("deprecation"), "true");
  const vbody = validated.body as DeprecatedBody;
  assert.equal(vbody.deprecated, true);
  assert.equal(vbody.committed, false);
  assert.equal(vbody.written, 0);
  assert.equal(vbody.maps?.length, 0);
  assert.ok(vbody.report?.issues.some((i) => i.code === "DEPRECATED"));
  assert.match(vbody.message || "", /特典词典/);

  const imported = await api("/admin/version-benefit/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ text: PASS_CSV }),
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal((imported.body as DeprecatedBody).written, 0);
  assert.equal((imported.body as DeprecatedBody).deprecated, true);

  const created = await api("/admin/version-benefit/maps", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ releaseId: ARIRANG, channelCode: "weverse" }),
  });
  assert.equal(created.status, 200);
  assert.equal((created.body as DeprecatedBody).deprecated, true);

  const listed = await api(`/admin/version-benefit/maps?releaseId=${ARIRANG}`, { headers: auth(token) });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("deprecation"), "true");
  assert.equal((listed.body as DeprecatedBody).maps?.length, 0);
  assert.equal((listed.body as DeprecatedBody).deprecated, true);

  const after = await query("SELECT count(*)::int AS n FROM release_benefit_map");
  assert.equal(after.rows[0].n, before.rows[0].n);
  assert.equal(BENEFIT_MAP_DEPRECATED_MESSAGE.includes("特典词典"), true);
});

test("channel dictionary CRUD remains available", async () => {
  const token = await opsToken();
  const channels = await api("/admin/version-benefit/channels", { headers: auth(token) });
  assert.equal(channels.status, 200);
  assert.ok(((channels.body as { channels: { code: string }[] }).channels || []).some((c) => c.code === "unknown"));
  assert.ok(((channels.body as { channels: { code: string }[] }).channels || []).some((c) => c.code === "tmall-flagship"));

  const board = await api("/admin/completeness", { headers: auth(token) });
  assert.equal(board.status, 200);
  assert.ok(Array.isArray((board.body as { groups: unknown[] }).groups));
});
