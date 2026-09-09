import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { hashPassword } from "../src/opsAuth.js";
import { sid } from "../src/ids.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
const ARIRANG = sid("release:bts:arirang");
const RM = sid("member:bts:RM");

type Ticket = {
  id: string;
  status: string;
  body: string;
  internalNote: string | null;
  closedAt: string | null;
  assignee: { id: string; username: string } | null;
  linkedTemplate: { id: string; name: string; status: string; version: string } | null;
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

async function opsToken() {
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "ops", password: "ops-dev" }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return (login.body as { token: string }).token;
}

async function wxToken(code: string) {
  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  assert.equal(login.status, 200);
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

test("ticket APIs require ops auth (401 / reviewer 403); x-admin-token works", async () => {
  const paths = ["/admin/tickets", "/admin/tickets/00000000-0000-4000-8000-000000000001"];
  for (const p of paths) {
    const res = await api(p);
    assert.equal(res.status, 401, p);
  }
  const wx = await wxToken("mock:ops3-collector");
  const denied = await api("/admin/tickets", { headers: auth(wx) });
  assert.equal(denied.status, 401);

  const hash = await hashPassword("reviewer-ops3");
  await query(
    `INSERT INTO ops_users (username, password_hash, role, allowlisted)
     VALUES ('reviewer-ops3', $1, 'reviewer', true)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'reviewer'`,
    [hash],
  );
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "reviewer-ops3", password: "reviewer-ops3" }),
  });
  assert.equal(login.status, 200);
  const reviewerTok = (login.body as { token: string }).token;
  const forbidden = await api("/admin/tickets", { headers: auth(reviewerTok) });
  assert.equal(forbidden.status, 403);

  const legacy = await api("/admin/tickets", { headers: { "x-admin-token": "dev-admin" } });
  assert.equal(legacy.status, 200);
  assert.ok(Array.isArray((legacy.body as { tickets: unknown[] }).tickets));
});

test("A08 user submits text missing-feedback → Admin shows open ticket; assign/close", async () => {
  const userTok = await wxToken("mock:ops3-a08");
  const submitted = await api("/feedback/missing", {
    method: "POST",
    headers: auth(userTok),
    body: JSON.stringify({ text: "FOCUS 缺一张 Juun 特典-Soundwave" }),
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  const feedback = submitted.body as Record<string, unknown>;
  assert.ok(feedback.id);
  assert.ok(feedback.createdAt);
  assert.equal(feedback.status, undefined, "C-side must not receive ticket status");
  assert.equal(feedback.internalNote, undefined);

  const progress = await api("/feedback/missing", { headers: auth(userTok) });
  assert.equal(progress.status, 404, "no C-side missing-card progress in M2.5");

  const token = await opsToken();
  const openList = await api("/admin/tickets?status=open", { headers: auth(token) });
  assert.equal(openList.status, 200, JSON.stringify(openList.body));
  const listed = (openList.body as { tickets: Ticket[] }).tickets.find((t) => t.id === feedback.id);
  assert.ok(listed, "Admin must show the open ticket");
  assert.equal(listed!.status, "open");
  assert.equal(listed!.body, "FOCUS 缺一张 Juun 特典-Soundwave");

  const claimed = await api(`/admin/tickets/${feedback.id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal((claimed.body as Ticket).status, "in_progress");
  assert.equal((claimed.body as Ticket).assignee?.username, "ops");

  const created = await api(`/admin/tickets/${feedback.id}/templates`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS3-A08-Draft",
      name: "OPS3 missing draft",
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const createdBody = created.body as { ticket: Ticket; template: { id: string; status: string; version: string } };
  assert.equal(createdBody.template.status, "draft");
  assert.equal(createdBody.ticket.linkedTemplate?.id, createdBody.template.id);
  assert.equal(createdBody.ticket.linkedTemplate?.status, "draft");

  const catalog = await api("/catalog/search?q=OPS3-A08-Draft");
  assert.equal(catalog.status, 200);
  const hits = (catalog.body as { templates: { version: string }[] }).templates || [];
  assert.ok(!hits.some((t) => t.version === "OPS3-A08-Draft"), "draft from ticket must not appear in C-side catalog");

  const noNote = await api(`/admin/tickets/${feedback.id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(noNote.status, 400);

  const closed = await api(`/admin/tickets/${feedback.id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "done", internalNote: "已建草稿，走图鉴页发布" }),
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal((closed.body as Ticket).status, "done");
  assert.ok((closed.body as Ticket).closedAt);
  assert.equal((closed.body as Ticket).internalNote, "已建草稿，走图鉴页发布");

  const stillOpen = await api("/admin/tickets?status=open", { headers: auth(token) });
  assert.ok(!(stillOpen.body as { tickets: Ticket[] }).tickets.some((t) => t.id === feedback.id));
  const doneList = await api("/admin/tickets?status=done", { headers: auth(token) });
  assert.ok((doneList.body as { tickets: Ticket[] }).tickets.some((t) => t.id === feedback.id));

  const audit = await api("/admin/audit", { headers: auth(token) });
  const logs = (audit.body as { logs: { action: string; entityId: string }[] }).logs;
  assert.ok(logs.some((l) => l.action === "ticket.update" && l.entityId === feedback.id));
  assert.ok(logs.some((l) => l.action === "ticket.create_template" && l.entityId === feedback.id));
});

test("ticket status transitions and existing-template link", async () => {
  const userTok = await wxToken("mock:ops3-transitions");
  const submitted = await api("/feedback/missing", {
    method: "POST",
    headers: auth(userTok),
    body: JSON.stringify({ text: "ARIRANG 缺 RM Standard" }),
  });
  const id = (submitted.body as { id: string }).id;
  const token = await opsToken();

  const existing = await query<{ id: string; status: string }>(
    "SELECT id, status FROM templates WHERE dedupe_key = $1",
    ["bts:ARIRANG:RM:Standard"],
  );
  assert.ok(existing.rows[0]);
  const templateId = existing.rows[0].id;
  assert.equal(existing.rows[0].status, "published");

  const linked = await api(`/admin/tickets/${id}/templates`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ templateId }),
  });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal((linked.body as Ticket).linkedTemplate?.id, templateId);
  assert.equal((linked.body as Ticket).linkedTemplate?.status, "published");
  const stillPublished = await query<{ status: string }>("SELECT status FROM templates WHERE id = $1", [templateId]);
  assert.equal(stillPublished.rows[0].status, "published", "linking must not change catalog status");

  const refusePublish = await api(`/admin/tickets/${id}/templates`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS3-No-Publish",
      status: "published",
    }),
  });
  assert.equal(refusePublish.status, 400);
  const notCreated = await query("SELECT id FROM templates WHERE version = $1", ["OPS3-No-Publish"]);
  assert.equal(notCreated.rowCount, 0);

  await api(`/admin/tickets/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "in_progress" }),
  });
  const wontfix = await api(`/admin/tickets/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "wontfix", internalNote: "图鉴已有 Standard" }),
  });
  assert.equal(wontfix.status, 200);
  assert.equal((wontfix.body as Ticket).status, "wontfix");

  const bad = await api(`/admin/tickets/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: { code: string } }).error.code, "INVALID_TRANSITION");

  const reopened = await api(`/admin/tickets/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ status: "open" }),
  });
  assert.equal(reopened.status, 200);
  assert.equal((reopened.body as Ticket).status, "open");
  assert.equal((reopened.body as Ticket).closedAt, null);
});
