import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { hashPassword } from "../src/opsAuth.js";
import { GROUP_BTS } from "../src/ids.js";
import type { Server } from "node:http";

let server: Server;
let base = "";

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

test("A01 unauthorized cannot open admin protected APIs", async () => {
  const paths = [
    "/admin/feed",
    "/admin/schedule",
    "/admin/audit",
    "/admin/templates",
    "/admin/tickets",
    "/admin/auth/me",
  ];
  for (const p of paths) {
    const res = await api(p);
    assert.equal(res.status, 401, p);
  }
  const write = await api("/admin/feed", {
    method: "POST",
    body: JSON.stringify({ title: "nope", groupIds: [GROUP_BTS] }),
  });
  assert.equal(write.status, 401);
});

test("A01 WeChat user JWT is not an ops session", async () => {
  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:ops0-collector" }),
  });
  assert.equal(login.status, 200);
  const token = (login.body as { token: string }).token;
  const res = await api("/admin/feed", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 401);
});

test("legacy x-admin-token still works for scripts", async () => {
  const res = await api("/admin/feed", {
    headers: { "x-admin-token": "dev-admin" },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((res.body as { items: unknown[] }).items));
});

test("ops can log in and see Catalog | Intel | Tickets menu", async () => {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const data = login.body as {
    token: string;
    user: { username: string; role: string; menus: { id: string; label: string }[] };
  };
  assert.ok(data.token);
  assert.equal(data.user.username, "ops");
  assert.equal(data.user.role, "ops");
  assert.deepEqual(
    data.user.menus.map((m) => m.id),
    ["catalog", "intel", "tickets"],
  );
  assert.deepEqual(
    data.user.menus.map((m) => m.label),
    ["图鉴", "情报", "反馈/工单"],
  );

  const me = await api("/admin/auth/me", {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  assert.equal(me.status, 200);
  assert.equal((me.body as { user: { username: string } }).user.username, "ops");
});

test("wrong password is 401", async () => {
  const res = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "nope" }),
  });
  assert.equal(res.status, 401);
});

test("login and privileged write persist audit actor/time/entity", async () => {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  const token = (login.body as { token: string }).token;
  const created = await api("/admin/feed", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "OPS-0 audit sample",
      trustLevel: "L1",
      status: "draft",
      groupIds: [GROUP_BTS],
      sourceNote: "ops0",
      canonicalUrl: "https://example.com/ops0-audit",
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const feedId = (created.body as { id: string }).id;

  const audit = await api("/admin/audit", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(audit.status, 200);
  const logs = (audit.body as { logs: { action: string; entityType: string; entityId: string; actorUsername: string }[] })
    .logs;
  assert.ok(logs.some((l) => l.action === "ops.login" && l.actorUsername === "ops"));
  const write = logs.find((l) => l.action === "feed.create" && l.entityId === feedId);
  assert.ok(write, "privileged write must record audit row");
  assert.equal(write!.entityType, "feed_item");
  assert.equal(write!.actorUsername, "ops");
});

test("reviewer role is reserved and cannot use protected admin APIs (403)", async () => {
  const hash = await hashPassword("reviewer-dev");
  await query(
    `INSERT INTO ops_users (username, password_hash, role, allowlisted)
     VALUES ('reviewer', $1, 'reviewer', true)`,
    [hash],
  );
  const constraint = await query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'ops_users'::regclass AND contype = 'c' AND conname LIKE '%role%'`,
  );
  assert.ok(
    constraint.rows.some((r) => /reviewer/.test(String(r.def))),
    "ops_users.role must reserve reviewer",
  );

  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "reviewer", password: "reviewer-dev" }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const token = (login.body as { token: string }).token;
  assert.equal((login.body as { user: { role: string } }).user.role, "reviewer");

  const me = await api("/admin/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);

  const feed = await api("/admin/feed", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(feed.status, 403);
  const audit = await api("/admin/audit", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(audit.status, 403);
});

test("ops allowlist rejects non-listed username", async () => {
  const hash = await hashPassword("outside");
  await query(
    `INSERT INTO ops_users (username, password_hash, role, allowlisted)
     VALUES ('outsider', $1, 'ops', false)
     ON CONFLICT (username) DO UPDATE SET allowlisted = false, password_hash = EXCLUDED.password_hash`,
    [hash],
  );
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "outsider", password: "outside" }),
  });
  assert.equal(login.status, 403);
});

test("logout returns 200", async () => {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  const token = (login.body as { token: string }).token;
  const out = await api("/admin/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(out.status, 200);
});
