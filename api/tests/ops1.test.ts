import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { hashPassword } from "../src/opsAuth.js";
import { GROUP_BTS, sid } from "../src/ids.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
const ARIRANG = sid("release:bts:arirang");
const RM = sid("member:bts:RM");

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

test("catalog write APIs require ops auth", async () => {
  const paths = [
    "/admin/catalog/groups",
    "/admin/catalog/members",
    "/admin/catalog/releases",
    "/admin/catalog/templates",
  ];
  for (const p of paths) {
    const res = await api(p);
    assert.equal(res.status, 401, p);
  }
  const wx = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:ops1-collector" }),
  });
  const wxTok = (wx.body as { token: string }).token;
  const denied = await api("/admin/catalog/groups", { headers: { Authorization: `Bearer ${wxTok}` } });
  assert.equal(denied.status, 401);
});

test("reviewer cannot write catalog (403); x-admin-token still works", async () => {
  const hash = await hashPassword("reviewer-ops1");
  await query(
    `INSERT INTO ops_users (username, password_hash, role, allowlisted)
     VALUES ('reviewer-ops1', $1, 'reviewer', true)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'reviewer'`,
    [hash],
  );
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "reviewer-ops1", password: "reviewer-ops1" }),
  });
  assert.equal(login.status, 200);
  const token = (login.body as { token: string }).token;
  const res = await api("/admin/catalog/groups", { headers: auth(token) });
  assert.equal(res.status, 403);

  const legacy = await api("/admin/catalog/groups", { headers: { "x-admin-token": "dev-admin" } });
  assert.equal(legacy.status, 200);
  assert.ok(Array.isArray((legacy.body as { groups: unknown[] }).groups));
});

test("A02 draft group/member/release/template invisible in catalog and completeness", async () => {
  const token = await opsToken();
  const group = await api("/admin/catalog/groups", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      slug: "ops1-draft-group",
      nameZh: "OPS1草稿团",
      nameEn: "OPS1 Draft Group",
      nameKo: "OPS1",
      isPilot: true,
    }),
  });
  assert.equal(group.status, 200, JSON.stringify(group.body));
  const groupId = (group.body as { id: string; status: string }).id;
  assert.equal((group.body as { status: string }).status, "draft");

  const publicGroups = await api("/catalog/groups");
  const slugs = (publicGroups.body as { groups: { slug: string }[] }).groups.map((g) => g.slug);
  assert.ok(!slugs.includes("ops1-draft-group"));

  const hidden = await api(`/catalog/groups/${groupId}`);
  assert.equal(hidden.status, 404);

  const member = await api("/admin/catalog/members", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      groupId: GROUP_BTS,
      nameEn: "OPS1-Draft-Member",
      nameZh: "草稿成员",
    }),
  });
  assert.equal(member.status, 200, JSON.stringify(member.body));
  const memberId = (member.body as { id: string }).id;
  const btsPublic = await api("/catalog/groups/bts/members");
  const names = (btsPublic.body as { members: { nameEn: string }[] }).members.map((m) => m.nameEn);
  assert.ok(!names.includes("OPS1-Draft-Member"));

  const release = await api("/admin/catalog/releases", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      groupId: GROUP_BTS,
      title: "OPS1 Draft Release",
      releasedOn: "2026-09-01",
      kind: "concert_md",
    }),
  });
  assert.equal(release.status, 200, JSON.stringify(release.body));
  const releaseId = (release.body as { id: string; kind: string }).id;
  assert.equal((release.body as { kind: string }).kind, "concert_md");
  const publicRels = await api("/catalog/groups/bts/releases");
  const titles = (publicRels.body as { releases: { title: string }[] }).releases.map((r) => r.title);
  assert.ok(!titles.includes("OPS1 Draft Release"));

  const draftTpl = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS1-Draft-Invisible",
      name: "OPS1 Draft Invisible Card",
    }),
  });
  assert.equal(draftTpl.status, 200, JSON.stringify(draftTpl.body));
  const tplId = (draftTpl.body as { id: string }).id;

  const search = await api("/catalog/search?q=OPS1-Draft-Invisible");
  assert.equal(search.status, 200);
  const found = (search.body as { templates: { id: string }[]; empty: boolean }).templates;
  assert.equal(found.length, 0);
  assert.equal((search.body as { empty: boolean }).empty, true);

  const catalog = await api("/catalog/templates?q=OPS1-Draft-Invisible");
  assert.ok(!(catalog.body as { templates: { id: string }[] }).templates.some((t) => t.id === tplId));

  const wx = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:ops1-progress" }),
  });
  const userTok = (wx.body as { token: string }).token;
  const prog = await api("/collection/groups/bts/progress", { headers: { Authorization: `Bearer ${userTok}` } });
  assert.equal(prog.status, 200);
  const published = (prog.body as { publishedCount: number }).publishedCount;
  assert.ok(published >= 21);
  const row = await query("SELECT status FROM templates WHERE id = $1", [tplId]);
  assert.equal(row.rows[0].status, "draft");

  void memberId;
  void releaseId;
});

test("A03 no-image publish fails", async () => {
  const token = await opsToken();
  const created = await api("/admin/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS1-NoImg",
      name: "OPS1 No Image",
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  const pub = await api(`/admin/templates/${id}/publish`, { method: "POST", headers: auth(token) });
  assert.equal(pub.status, 400);
  assert.equal((pub.body as { error: { code: string } }).error.code, "IMAGE_REQUIRED");

  const viaStatus = await api(`/admin/catalog/templates/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(viaStatus.status, 400);
  assert.equal((viaStatus.body as { error: { code: string } }).error.code, "IMAGE_REQUIRED");
});

test("A04 publish with image becomes visible; completeness increases", async () => {
  const token = await opsToken();
  const created = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS1-Visible",
      name: "OPS1 Visible Card",
      mainImageUrl: "/media/cards/ops1-visible.png",
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;

  const beforeSearch = await api("/catalog/search?q=OPS1-Visible");
  assert.equal((beforeSearch.body as { templates: unknown[] }).templates.length, 0);

  const pub = await api(`/admin/catalog/templates/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal((pub.body as { status: string }).status, "published");

  const afterSearch = await api("/catalog/search?q=OPS1-Visible");
  const tpls = (afterSearch.body as { templates: { id: string; status: string }[] }).templates;
  assert.ok(tpls.some((t) => t.id === id && t.status === "published"));

  const wx = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:ops1-visible" }),
  });
  const userTok = (wx.body as { token: string }).token;
  const prog = await api("/collection/groups/bts/progress", { headers: { Authorization: `Bearer ${userTok}` } });
  const ids = await query(
    "SELECT 1 FROM templates WHERE id = $1 AND status = 'published' AND is_deprecated = false",
    [id],
  );
  assert.equal(ids.rowCount, 1);
  assert.ok((prog.body as { publishedCount: number }).publishedCount >= 22);
});

test("A05 duplicate published under same dedupe key is rejected", async () => {
  const token = await opsToken();
  const first = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS1-Dedupe",
      name: "OPS1 Dedupe A",
      mainImageUrl: "/media/cards/ops1-dedupe.png",
    }),
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const id = (first.body as { id: string }).id;
  const pub = await api(`/admin/templates/${id}/publish`, { method: "POST", headers: auth(token) });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));

  const dup = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS1-Dedupe",
      name: "OPS1 Dedupe B",
      mainImageUrl: "/media/cards/ops1-dedupe-b.png",
    }),
  });
  assert.equal(dup.status, 409);
  assert.equal((dup.body as { error: { code: string } }).error.code, "DUPLICATE_PUBLISHED");

  const rows = await query("SELECT id FROM templates WHERE dedupe_key = $1", [
    "bts:ARIRANG:RM:OPS1-Dedupe",
  ]);
  assert.equal(rows.rowCount, 1);
});

test("create/update/status persist audit actor and entity", async () => {
  const token = await opsToken();
  const created = await api("/admin/catalog/groups", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ slug: "ops1-audit", nameZh: "审计团", nameEn: "Audit Group" }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  const patched = await api(`/admin/catalog/groups/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ nameZh: "审计团改" }),
  });
  assert.equal(patched.status, 200);
  const st = await api(`/admin/catalog/groups/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(st.status, 200);

  const audit = await api("/admin/audit?limit=40", { headers: auth(token) });
  const logs = (audit.body as { logs: { action: string; entityType: string; entityId: string; actorUsername: string }[] })
    .logs;
  assert.ok(logs.some((l) => l.action === "group.create" && l.entityId === id && l.actorUsername === "ops"));
  assert.ok(logs.some((l) => l.action === "group.update" && l.entityId === id));
  assert.ok(logs.some((l) => l.action === "group.published" && l.entityId === id));
});

test("deprecate hides template from completeness; concert_md release is first-class", async () => {
  const token = await opsToken();
  const rel = await api("/admin/catalog/releases", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      groupId: GROUP_BTS,
      title: "OPS1 Concert MD",
      releasedOn: "2026-08-01",
      kind: "concert_md",
    }),
  });
  const releaseId = (rel.body as { id: string }).id;
  await api(`/admin/catalog/releases/${releaseId}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });
  const listed = await api("/admin/catalog/releases?groupId=" + GROUP_BTS, { headers: auth(token) });
  const concert = (listed.body as { releases: { id: string; kind: string }[] }).releases.find((r) => r.id === releaseId);
  assert.equal(concert?.kind, "concert_md");

  const created = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId,
      memberId: RM,
      version: "OPS1-Deprecate",
      name: "OPS1 Deprecate",
      mainImageUrl: "/media/cards/ops1-dep.png",
    }),
  });
  const id = (created.body as { id: string }).id;
  await api(`/admin/templates/${id}/publish`, { method: "POST", headers: auth(token) });
  const wx = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:ops1-dep" }),
  });
  const userTok = (wx.body as { token: string }).token;
  const afterPub = await api("/collection/groups/bts/progress", { headers: { Authorization: `Bearer ${userTok}` } });
  const publishedAfter = (afterPub.body as { publishedCount: number }).publishedCount;
  assert.ok(publishedAfter >= 23);

  const dep = await api(`/admin/templates/${id}/deprecate`, { method: "POST", headers: auth(token) });
  assert.equal(dep.status, 200);
  assert.equal((dep.body as { status: string }).status, "deprecated");

  const afterDep = await api("/collection/groups/bts/progress", { headers: { Authorization: `Bearer ${userTok}` } });
  assert.equal((afterDep.body as { publishedCount: number }).publishedCount, publishedAfter - 1);
});
