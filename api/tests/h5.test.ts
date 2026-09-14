import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_BTS, sid } from "../src/ids.js";
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
    /* raw html */
  }
  return { status: res.status, body, text };
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

test("U2a-01 unauth share summary is published-only (no draft / pending UGC / internal notes)", async () => {
  const secretNote = "INTERNAL-NOTE-MUST-NOT-LEAK";
  const pendingTitle = "PENDING-UGC-MUST-NOT-LEAK";
  const draftSlug = "h5-draft-group";

  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:h5-leak" }),
  });
  const userId = (login.body as { user: { id: string } }).user.id;

  await query(
    `INSERT INTO missing_feedback (user_id, body, internal_note) VALUES ($1, $2, $3)`,
    [userId, "缺一张卡", secretNote],
  );
  await query(
    `INSERT INTO user_custom_cards (user_id, image_front, title, moderation_status, group_id)
     VALUES ($1, $2, $3, 'pending', $4)`,
    [userId, "/media/custom/pending-secret.png", pendingTitle, GROUP_BTS],
  );
  await query(
    `INSERT INTO idol_groups (id, slug, name_zh, name_en, name_ko, aliases, logo_color, is_pilot, status)
     VALUES ($1, $2, '草稿组合', 'Draft Group', '초안', '', '#000', true, 'draft')`,
    [sid("group:h5-draft"), draftSlug],
  );

  const summary = await api("/share/summary?g=bts");
  assert.equal(summary.status, 200);
  const payload = JSON.stringify(summary.body);
  assert.match(payload, /防弹少年团/);
  assert.match(payload, /ARIRANG/);
  assert.doesNotMatch(payload, new RegExp(secretNote));
  assert.doesNotMatch(payload, new RegExp(pendingTitle));
  assert.doesNotMatch(payload, /pending-secret/);
  assert.doesNotMatch(payload, /Carmen Draft No Image/);
  assert.doesNotMatch(payload, /H2H-DRAFT-NOIMG/);
  assert.equal((summary.body as { kind: string }).kind, "group");
  assert.ok(!(summary.body as { group: { releases: { title: string }[] } }).group.releases.some((r) => /draft/i.test(r.title)));

  const draftGroup = await api(`/share/summary?g=${draftSlug}`);
  assert.equal(draftGroup.status, 404);

  const draftTpl = sid("tpl:h2h:draft-no-image");
  const draftTplSummary = await api(`/share/summary?t=${draftTpl}`);
  assert.equal(draftTplSummary.status, 404);
  const draftTplGet = await api(`/catalog/templates/${draftTpl}`);
  assert.equal(draftTplGet.status, 404);
});

test("U2a-01 / U2a-02 share landing HTML upgrades QR placeholder", async () => {
  const landing = await api("/share/landing?g=bts&noredirect=1");
  assert.equal(landing.status, 200);
  assert.match(landing.text, /防弹少年团/);
  assert.match(landing.text, /打开星卡小程序/);
  assert.match(landing.text, /pages\/catalog-group\/index\?id=bts/);
  assert.doesNotMatch(landing.text, /M1 无 Web 客户端/);
  assert.doesNotMatch(landing.text, /Carmen Draft No Image/);
  assert.doesNotMatch(landing.text, /INTERNAL-NOTE-MUST-NOT-LEAK/);
});

test("U2a-04 WeChat web login maps to the same user_id via unionId", async () => {
  const mp = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:h5-mp-alice", unionId: "union-h5-alice" }),
  });
  assert.equal(mp.status, 200);
  const mpUser = (mp.body as { user: { id: string } }).user;

  const web = await api("/auth/wx-web-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:web:alice-oa", unionId: "union-h5-alice" }),
  });
  assert.equal(web.status, 200);
  const webUser = (web.body as { user: { id: string }; token: string; channel: string }).user;
  assert.equal(webUser.id, mpUser.id);

  const me = await fetch(base + "/me", {
    headers: { Authorization: `Bearer ${(web.body as { token: string }).token}` },
  });
  assert.equal(me.status, 200);
  const meBody = (await me.json()) as { id: string };
  assert.equal(meBody.id, mpUser.id);

  const other = await api("/auth/wx-web-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:web:bob-only" }),
  });
  assert.equal(other.status, 200);
  assert.notEqual((other.body as { user: { id: string } }).user.id, mpUser.id);
});

test("U2a-05 published catalog helpers stay consistent with mini-program gating", async () => {
  const groups = await api("/catalog/groups");
  assert.equal(groups.status, 200);
  const slugs = (groups.body as { groups: { slug: string }[] }).groups.map((g) => g.slug);
  assert.ok(slugs.includes("bts"));
  assert.ok(!slugs.includes("h5-draft-group"));

  const search = await api("/catalog/search?q=ARIRANG");
  assert.equal(search.status, 200);
  const templates = (search.body as { templates: { id: string; version: string }[] }).templates;
  assert.ok(templates.length > 0);
  const one = await api(`/catalog/templates/${templates[0].id}`);
  assert.equal(one.status, 200);
  assert.equal((one.body as { template: { id: string } }).template.id, templates[0].id);

  const release = await api(`/catalog/releases/${sid("release:bts:arirang")}`);
  assert.equal(release.status, 200);
  assert.equal((release.body as { release: { title: string } }).release.title, "ARIRANG");
});

test("U2a-06 H5 bootstrap has no write entry; wx-web start is read-only auth", async () => {
  const boot = await api("/h5/bootstrap");
  assert.equal(boot.status, 200);
  const text = JSON.stringify(boot.body);
  assert.doesNotMatch(text, /\/collection\//);
  assert.doesNotMatch(text, /custom-cards/);
  assert.doesNotMatch(text, /\/admin\//);

  const start = await api("/auth/wx-web/start?format=json&returnTo=/catalog");
  assert.equal(start.status, 200);
  assert.ok((start.body as { url: string }).url);
});
