import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_BTS, sid } from "../src/ids.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
let token = "";
let userId = "";

async function api(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
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

test("A01 guest can read catalog", async () => {
  const prev = token;
  token = "";
  const res = await api("/catalog/groups");
  token = prev;
  assert.equal(res.status, 200);
  const groups = (res.body as { groups: { slug: string; scopeNote: string | null }[] }).groups;
  assert.deepEqual(groups.map((g) => g.slug).sort(), ["bts", "h2h"]);
  const bts = groups.find((g) => g.slug === "bts");
  assert.equal(bts?.scopeNote, "当前图鉴仅含《ARIRANG》切片");
});

test("A02 writes without auth are 401", async () => {
  const prev = token;
  token = "";
  const res = await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ templateId: sid("x"), quantity: 1 }),
  });
  token = prev;
  assert.equal(res.status, 401);
});

test("A03/A04 mock wx-login + GET /me", async () => {
  token = "";
  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:path-b" }),
  });
  assert.equal(login.status, 200);
  const data = login.body as { token: string; user: { id: string; privacy: string }; mock: boolean };
  assert.ok(data.token);
  assert.equal(data.user.privacy, "private");
  token = data.token;
  userId = data.user.id;
  const me = await api("/me");
  assert.equal(me.status, 200);
  assert.equal((me.body as { id: string }).id, userId);
});

test("A05 follows persist; X01 privacy enum only", async () => {
  const put = await api("/me/follows", {
    method: "PUT",
    body: JSON.stringify({ groupIds: [GROUP_BTS] }),
  });
  assert.equal(put.status, 200);
  const got = await api("/me/follows");
  assert.equal((got.body as { groups: { slug: string }[] }).groups[0].slug, "bts");

  const bad = await api("/me", {
    method: "PATCH",
    body: JSON.stringify({ privacy: "friends" }),
  });
  assert.equal(bad.status, 400);
  const ok = await api("/me", {
    method: "PATCH",
    body: JSON.stringify({ privacy: "public" }),
  });
  assert.equal(ok.status, 200);
  assert.equal((ok.body as { privacy: string }).privacy, "public");
});

test("C01-C04 / Path B: search album → batch own → progress", async () => {
  const search = await api("/catalog/search?q=ARIRANG");
  assert.equal(search.status, 200);
  const templates = (search.body as { templates: { id: string; isBenefit: boolean; isDeprecated: boolean }[] }).templates;
  assert.ok(templates.length >= 21);
  assert.ok(templates.some((t) => t.isBenefit));
  assert.ok(templates.every((t) => !t.isDeprecated));

  const pick = templates.slice(0, 5).map((t) => ({ templateId: t.id, quantity: 1 }));
  const own = await api("/collection/cards/batch", {
    method: "POST",
    body: JSON.stringify({ items: pick }),
  });
  assert.equal(own.status, 200);
  assert.equal((own.body as { count: number }).count, 5);

  const prog = await api("/collection/groups/bts/progress");
  const p = prog.body as { ownedDistinct: number; publishedCount: number; footnote: string; copy: string };
  assert.equal(p.ownedDistinct, 5);
  assert.equal(p.publishedCount, 21);
  assert.equal(p.footnote, "当前图鉴仅含《ARIRANG》切片");
  assert.match(p.copy, /含特典/);
  assert.match(p.copy, /不含已废弃/);

  const overview = await api("/collection/overview");
  assert.equal((overview.body as { searchEnabled: boolean }).searchEnabled, false);
  const bts = (overview.body as { groups: { slug: string; progress: { ownedDistinct: number } }[] }).groups.find(
    (g) => g.slug === "bts",
  );
  assert.equal(bts?.progress.ownedDistinct, 5);
});

test("O01 own auto-removes want", async () => {
  const search = await api("/catalog/search?q=FOCUS%20Ye-on%20Regular");
  const t = (search.body as { templates: { id: string }[] }).templates.find((x) =>
    JSON.stringify(x).includes("Ye-on"),
  );
  assert.ok(t);
  await api("/collection/wants", { method: "POST", body: JSON.stringify({ templateId: t!.id }) });
  let wants = await api("/collection/wants");
  assert.ok((wants.body as { templateIds: string[] }).templateIds.includes(t!.id));
  await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t!.id, quantity: 1 }] }),
  });
  wants = await api("/collection/wants");
  assert.ok(!(wants.body as { templateIds: string[] }).templateIds.includes(t!.id));
});

test("O02 owned + want → toast mutex, do not write", async () => {
  const search = await api("/catalog/search?q=ARIRANG%20RM%20Standard");
  const t = (search.body as { templates: { id: string }[] }).templates[0];
  await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 1 }] }),
  });
  const want = await api("/collection/wants", {
    method: "POST",
    body: JSON.stringify({ templateId: t.id }),
  });
  // HTTP 200 + business code so mini-program Toast can key off the body (not 409).
  assert.equal(want.status, 200);
  const mutex = want.body as { code: string; message: string; wanted: boolean };
  assert.equal(mutex.code, "OWN_WANT_MUTEX");
  assert.match(mutex.message, /已拥有/);
  assert.equal(mutex.wanted, false);
  const wants = await api("/collection/wants");
  assert.ok(!(wants.body as { templateIds: string[] }).templateIds.includes(t.id));
});

test("O03 un-own does not re-add want", async () => {
  const search = await api("/catalog/search?q=Lemon%20Tang%20Ian%20Lemon%20Sun");
  const t = (search.body as { templates: { id: string }[] }).templates[0];
  await api("/collection/wants", { method: "POST", body: JSON.stringify({ templateId: t.id }) });
  await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 1 }] }),
  });
  const del = await api(`/collection/cards/${t.id}`, { method: "DELETE" });
  assert.equal((del.body as { wantRestored: boolean }).wantRestored, false);
  const wants = await api("/collection/wants");
  assert.ok(!(wants.body as { templateIds: string[] }).templateIds.includes(t.id));
});

test("O06/O07 quantity>=1; revoke deletes row", async () => {
  const search = await api("/catalog/search?q=The%20Chase%20Stella%20Photobook%20A");
  const t = (search.body as { templates: { id: string }[] }).templates[0];
  const zero = await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 0 }] }),
  });
  assert.equal(zero.status, 400);
  await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 2 }] }),
  });
  const again = await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 3 }] }),
  });
  assert.equal(again.status, 200);
  const rows = await query(
    "SELECT quantity FROM user_cards WHERE user_id = $1 AND template_id = $2",
    [userId, t.id],
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].quantity, 3);
  await api(`/collection/cards/${t.id}`, { method: "DELETE" });
  const after = await query(
    "SELECT 1 FROM user_cards WHERE user_id = $1 AND template_id = $2",
    [userId, t.id],
  );
  assert.equal(after.rowCount, 0);
});

test("O09 progress includes 特典, excludes deprecated", async () => {
  const h2h = await api("/collection/groups/h2h/progress");
  const p = h2h.body as { publishedCount: number; benefitCount: number };
  assert.equal(p.publishedCount, 80);
  assert.equal(p.benefitCount, 40);
  const dep = await query("SELECT 1 FROM templates WHERE is_deprecated = true AND status = 'published'");
  assert.ok((dep.rowCount || 0) >= 1);
});

test("S01-S03 / P8 share concatenates ALL owned cards", async () => {
  const all = await api("/catalog/search?q=ARIRANG");
  const templates = (all.body as { templates: { id: string }[] }).templates;
  await api("/collection/cards/batch", {
    method: "POST",
    body: JSON.stringify({ items: templates.map((t) => ({ templateId: t.id, quantity: 1 })) }),
  });
  const share = await api("/share/image", {
    method: "POST",
    body: JSON.stringify({ groupId: "bts" }),
  });
  assert.equal(share.status, 200);
  const data = share.body as {
    cardCount: number;
    templateIds: string[];
    truncated: boolean;
    hasQr: boolean;
    hasWatermark: boolean;
    url: string;
    height: number;
  };
  assert.equal(data.truncated, false);
  assert.equal(data.cardCount, templates.length);
  assert.equal(data.templateIds.length, templates.length);
  assert.equal(data.hasQr, true);
  assert.equal(data.hasWatermark, true);
  assert.ok(data.height > 900, "long image should grow with all cards");
  const img = await fetch(data.url.startsWith("http") ? data.url : base + data.url);
  assert.equal(img.status, 200);
  assert.match(img.headers.get("content-type") || "", /png/);
});

test("F01 missing feedback is text-only", async () => {
  const img = await api("/feedback/missing", {
    method: "POST",
    body: JSON.stringify({ text: "缺一张", image: "x" }),
  });
  assert.equal(img.status, 400);
  const ok = await api("/feedback/missing", {
    method: "POST",
    body: JSON.stringify({ text: "FOCUS 缺一张 Juun 特典" }),
  });
  assert.equal(ok.status, 200);
});

test("D01-D03 admin draft/publish/dedupe/image required", async () => {
  const noTok = await fetch(base + "/admin/templates", { headers: { "Content-Type": "application/json" } });
  assert.equal(noTok.status, 401);

  const headers = { "Content-Type": "application/json", "x-admin-token": "dev-admin" };
  const draft = await query("SELECT id FROM templates WHERE dedupe_key = $1", [
    "h2h:The Chase:Carmen:Draft-NoImg",
  ]);
  const draftId = draft.rows[0].id as string;
  const pub = await fetch(base + `/admin/templates/${draftId}/publish`, { method: "POST", headers });
  assert.equal(pub.status, 400);
  const pubBody = (await pub.json()) as { error: { code: string } };
  assert.equal(pubBody.error.code, "IMAGE_REQUIRED");

  const first = await fetch(base + "/admin/import", {
    method: "POST",
    headers,
    body: JSON.stringify({
      groupSlug: "h2h",
      releaseTitle: "The Chase",
      releasedOn: "2025-02-24",
      templates: [
        {
          memberEn: "Carmen",
          version: "Admin-Dedupe",
          status: "published",
          mainImageUrl: "/media/cards/x.png",
        },
      ],
    }),
  });
  assert.equal(first.status, 200);
  const second = await fetch(base + "/admin/import", {
    method: "POST",
    headers,
    body: JSON.stringify({
      groupSlug: "h2h",
      releaseTitle: "The Chase",
      releasedOn: "2025-02-24",
      templates: [
        {
          memberEn: "Carmen",
          version: "Admin-Dedupe",
          status: "published",
          mainImageUrl: "/media/cards/y.png",
        },
      ],
    }),
  });
  const rows = await query("SELECT id, main_image_url FROM templates WHERE dedupe_key = $1", [
    "h2h:The Chase:Carmen:Admin-Dedupe",
  ]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].main_image_url, "/media/cards/y.png");
  assert.equal(second.status, 200);
});

test("catalog_search empty is tracked", async () => {
  await api("/catalog/search?q=definitely-not-an-album-xyz");
  const ev = await query(
    `SELECT payload FROM analytics_events WHERE name = 'catalog_search' ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(ev.rows[0].payload.empty, true);
});

test("no friends API surface", async () => {
  const res = await api("/friends");
  assert.equal(res.status, 404);
});
