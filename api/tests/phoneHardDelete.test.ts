import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_H2H, sid } from "../src/ids.js";
import { maskPhone, toE164 } from "../src/phone.js";

let server: Server;
let base = "";

const adminHeaders = { "x-admin-token": "dev-admin" };

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

async function wxUser(code: string) {
  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const data = login.body as { token: string; user: { id: string; nickname: string } };
  return data;
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

test("maskPhone / toE164 are stable for CN mobiles", () => {
  assert.equal(toE164("13800138000"), "+8613800138000");
  assert.equal(toE164("+86 138-0013-8000"), "+8613800138000");
  assert.equal(maskPhone("+8613800138000"), "138****8000");
});

test("bind uniqueness + rebind overwrite; C-end never receives plaintext phone", async () => {
  const a = await wxUser("mock:phone-a");
  const b = await wxUser("mock:phone-b");

  const bindA = await api("/me/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ code: "mock:13800138000" }),
  });
  assert.equal(bindA.status, 200, JSON.stringify(bindA.body));
  const userA = bindA.body as { phoneMasked: string; phoneBound: boolean; phoneE164?: string };
  assert.equal(userA.phoneBound, true);
  assert.equal(userA.phoneMasked, "138****8000");
  assert.equal(userA.phoneE164, undefined);

  const taken = await api("/me/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ code: "mock:13800138000" }),
  });
  assert.equal(taken.status, 409);
  assert.equal((taken.body as { error: { code: string } }).error.code, "PHONE_TAKEN");

  const failEvents = await query<{ event: string; error_code: string | null; phone_masked: string | null }>(
    "SELECT event, error_code, phone_masked FROM phone_bind_events WHERE user_id = $1 ORDER BY created_at",
    [b.user.id],
  );
  assert.ok(failEvents.rows.some((r) => r.event === "bind_fail" && r.error_code === "PHONE_TAKEN"));
  assert.ok(failEvents.rows.every((r) => !String(r.phone_masked || "").includes("13800138000")));

  const rebind = await api("/me/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ code: "mock:13900139000" }),
  });
  assert.equal(rebind.status, 200, JSON.stringify(rebind.body));
  assert.equal((rebind.body as { phoneMasked: string }).phoneMasked, "139****9000");

  const eventsA = await query<{ event: string }>(
    "SELECT event FROM phone_bind_events WHERE user_id = $1 ORDER BY created_at",
    [a.user.id],
  );
  assert.ok(eventsA.rows.some((r) => r.event === "bind_success"));
  assert.ok(eventsA.rows.some((r) => r.event === "rebind"));

  const bindB = await api("/me/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ code: "mock:13800138000" }),
  });
  assert.equal(bindB.status, 200, JSON.stringify(bindB.body));

  const listed = await api(`/admin/users?q=${encodeURIComponent("13800138000")}`, { headers: adminHeaders });
  assert.equal(listed.status, 200);
  const users = (listed.body as { users: { id: string; phoneMasked: string; phoneE164?: string }[] }).users;
  assert.equal(users.length, 1);
  assert.equal(users[0].id, b.user.id);
  assert.equal(users[0].phoneMasked, "138****8000");
  assert.equal(users[0].phoneE164, undefined);
});

test("hard-delete requires confirm; cascade + audit; published catalog kept", async () => {
  const session = await wxUser("mock:hard-del-user");
  const userId = session.user.id;
  await query("UPDATE users SET nickname = $2 WHERE id = $1", [userId, "待删收藏家"]);

  await api("/me/phone", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ code: "mock:13700137000" }),
  });

  const ownedTpl = await query<{ id: string }>(
    "SELECT id FROM templates WHERE status = 'published' AND is_deprecated = false LIMIT 1",
  );
  assert.ok(ownedTpl.rows[0], "seed published template");
  await query(
    `INSERT INTO user_cards (user_id, template_id, quantity) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, template_id) DO NOTHING`,
    [userId, ownedTpl.rows[0].id],
  );
  await query(`INSERT INTO user_wants (user_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    userId,
    ownedTpl.rows[0].id,
  ]);
  await query(`INSERT INTO user_follows (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    userId,
    GROUP_H2H,
  ]);

  const keptTplId = randomUUID();
  const subId = randomUUID();
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key, source)
     VALUES ($1, $2, $3, $4, $5, $6, false, false, 'published', '/media/cards/kept-front.jpg', $7, 'user_submission')`,
    [
      keptTplId,
      sid("release:h2h:the-chase"),
      sid("member:h2h:Carmen"),
      `UGC-KEEP-${keptTplId.slice(0, 8)}`,
      "Kept Catalog Card",
      "P3-Keep",
      `h2h:The Chase:Carmen:P3-Keep-${keptTplId.slice(0, 8)}`,
    ],
  );
  await query(
    `INSERT INTO catalog_submissions
       (id, user_id, group_id, release_id, member_id, slot_label, image_front, status, result_template_id, points_awarded)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, 1)`,
    [
      subId,
      userId,
      GROUP_H2H,
      sid("release:h2h:the-chase"),
      sid("member:h2h:Carmen"),
      "Kept Catalog Card",
      `/media/ugc-pending/${userId}/front.jpg`,
      keptTplId,
    ],
  );
  await query(
    `INSERT INTO contribution_point_events (user_id, submission_id, points, reason)
     VALUES ($1, $2, 1, 'catalog_submission_approved')`,
    [userId, subId],
  );

  const missingConfirm = await api(`/admin/users/${userId}/hard-delete`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(missingConfirm.status, 400, JSON.stringify(missingConfirm.body));
  assert.match((missingConfirm.body as { error: { message: string } }).error.message, /确认/);

  const wrongConfirm = await api(`/admin/users/${userId}/hard-delete`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ confirm: "别人的昵称" }),
  });
  assert.equal(wrongConfirm.status, 400);

  const stillThere = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
  assert.equal(stillThere.rowCount, 1);

  const deleted = await api(`/admin/users/${userId}/hard-delete`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ confirm: "待删收藏家" }),
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  const payload = deleted.body as {
    deleted: boolean;
    cleanup: { users: number; user_cards: number; catalog_kept: number; queued_gc: number };
  };
  assert.equal(payload.deleted, true);
  assert.equal(payload.cleanup.users, 1);
  assert.ok(payload.cleanup.user_cards >= 1);
  assert.equal(payload.cleanup.catalog_kept, 1);
  assert.ok(payload.cleanup.queued_gc >= 1);

  const gone = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
  assert.equal(gone.rowCount, 0);
  const cards = await query("SELECT 1 FROM user_cards WHERE user_id = $1", [userId]);
  assert.equal(cards.rowCount, 0);
  const wants = await query("SELECT 1 FROM user_wants WHERE user_id = $1", [userId]);
  assert.equal(wants.rowCount, 0);
  const subs = await query("SELECT 1 FROM catalog_submissions WHERE user_id = $1", [userId]);
  assert.equal(subs.rowCount, 0);
  const points = await query("SELECT 1 FROM contribution_point_events WHERE user_id = $1", [userId]);
  assert.equal(points.rowCount, 0);
  const kept = await query<{ status: string; source: string }>(
    "SELECT status, source FROM templates WHERE id = $1",
    [keptTplId],
  );
  assert.equal(kept.rowCount, 1);
  assert.equal(kept.rows[0].status, "published");
  assert.equal(kept.rows[0].source, "user_submission");

  const me = await api("/me", { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(me.status, 401);

  const audit = await query<{ action: string; payload: { cleanup?: { catalog_kept?: number }; targetUserId?: string } }>(
    `SELECT action, payload FROM admin_audit_logs WHERE action = 'user.hard_delete' AND entity_id = $1`,
    [userId],
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].payload.targetUserId, userId);
  assert.equal(audit.rows[0].payload.cleanup?.catalog_kept, 1);

  const soft = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
  assert.equal(soft.rowCount, 0, "hard-delete must remove the users row; deleted_at is not enough");
});
