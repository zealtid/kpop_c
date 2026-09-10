import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_H2H, GROUP_BTS, sid } from "../src/ids.js";
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

test("mock wx-login keeps the same collector for mock:devtools", async () => {
  const prev = token;
  token = "";
  const first = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:devtools" }),
  });
  const second = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:devtools" }),
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const a = first.body as { user: { id: string } };
  const b = second.body as { user: { id: string } };
  assert.equal(a.user.id, b.user.id);

  const other = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:other-collector" }),
  });
  assert.notEqual((other.body as { user: { id: string } }).user.id, a.user.id);

  const ephemeralA = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "081AAA" }),
  });
  const ephemeralB = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "081BBB" }),
  });
  assert.notEqual(
    (ephemeralA.body as { user: { id: string } }).user.id,
    (ephemeralB.body as { user: { id: string } }).user.id,
    "raw js_code maps to dev:<code> — client must not send a new code every cold start",
  );
  token = prev;
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

test("O06 PATCH quantity/condition/notes is own-only; group detail returns fields", async () => {
  const search = await api("/catalog/search?q=The%20Chase%20Carmen%20Photobook%20A");
  const t = (search.body as { templates: { id: string }[] }).templates[0];
  assert.ok(t);

  await api("/collection/cards", {
    method: "POST",
    body: JSON.stringify({ items: [{ templateId: t.id, quantity: 1 }] }),
  });

  const patched = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: 2, condition: "near_mint", notes: "  抽卡重复  " }),
  });
  assert.equal(patched.status, 200);
  const saved = patched.body as {
    templateId: string;
    quantity: number;
    condition: string | null;
    notes: string | null;
  };
  assert.equal(saved.templateId, t.id);
  assert.equal(saved.quantity, 2);
  assert.equal(saved.condition, "near_mint");
  assert.equal(saved.notes, "抽卡重复");

  const got = await api(`/collection/cards/${t.id}`);
  assert.equal(got.status, 200);
  const card = got.body as { quantity: number; condition: string; notes: string; id: string };
  assert.equal(card.id, t.id);
  assert.equal(card.quantity, 2);
  assert.equal(card.condition, "near_mint");
  assert.equal(card.notes, "抽卡重复");

  const group = await api("/collection/groups/h2h");
  assert.equal(group.status, 200);
  const owned = (
    group.body as {
      owned: { id: string; quantity: number; condition: string | null; notes: string | null }[];
    }
  ).owned;
  const listed = owned.find((c) => c.id === t.id);
  assert.ok(listed);
  assert.equal(listed?.quantity, 2);
  assert.equal(listed?.condition, "near_mint");
  assert.equal(listed?.notes, "抽卡重复");
  const dupes = (group.body as { duplicates: { id: string }[] }).duplicates;
  assert.ok(dupes.some((c) => c.id === t.id));

  const zero = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: 0 }),
  });
  assert.equal(zero.status, 400);

  const badCond = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ condition: "minted" }),
  });
  assert.equal(badCond.status, 400);

  const notesOnly = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: "" }),
  });
  assert.equal(notesOnly.status, 200);
  assert.equal((notesOnly.body as { quantity: number; notes: string | null }).quantity, 2);
  assert.equal((notesOnly.body as { notes: string | null }).notes, null);

  const prev = token;
  token = "";
  const unauth = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: 3 }),
  });
  assert.equal(unauth.status, 401);

  const otherLogin = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:other-card-editor" }),
  });
  token = (otherLogin.body as { token: string }).token;
  const stolen = await api(`/collection/cards/${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: 9, notes: "not mine" }),
  });
  assert.equal(stolen.status, 404);
  token = prev;

  const still = await query(
    "SELECT quantity, condition, notes FROM user_cards WHERE user_id = $1 AND template_id = $2",
    [userId, t.id],
  );
  assert.equal(still.rowCount, 1);
  assert.equal(still.rows[0].quantity, 2);
  assert.equal(still.rows[0].notes, null);

  await api(`/collection/cards/${t.id}`, { method: "DELETE" });
  const afterDel = await api(`/collection/cards/${t.id}`);
  assert.equal(afterDel.status, 404);
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

test("C02 search matches name_ko and aliases; unrelated stays empty", async () => {
  type Tpl = {
    status: string;
    groupSlug: string;
    memberNameEn?: string | null;
    releaseTitle?: string;
    isDeprecated: boolean;
  };

  async function search(q: string) {
    const res = await api(`/catalog/search?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200);
    const body = res.body as { templates: Tpl[]; empty: boolean };
    return body;
  }

  const byGroupKo = await search("방탄소년단");
  assert.ok(byGroupKo.templates.length >= 21);
  assert.equal(byGroupKo.empty, false);
  assert.ok(byGroupKo.templates.every((t) => t.groupSlug === "bts"));
  assert.ok(byGroupKo.templates.every((t) => t.status === "published"));
  assert.ok(byGroupKo.templates.every((t) => !t.isDeprecated));

  const byH2hKo = await search("하츠투하츠");
  assert.ok(byH2hKo.templates.length > 0);
  assert.ok(byH2hKo.templates.every((t) => t.groupSlug === "h2h"));
  assert.ok(byH2hKo.templates.every((t) => t.status === "published"));

  const byMemberKo = await search("알엠");
  assert.ok(byMemberKo.templates.length >= 3);
  assert.ok(byMemberKo.templates.every((t) => t.memberNameEn === "RM"));
  assert.ok(byMemberKo.templates.every((t) => t.groupSlug === "bts"));

  const byAlias = await search("柾国");
  assert.ok(byAlias.templates.length >= 3);
  assert.equal(byAlias.empty, false);
  assert.ok(byAlias.templates.every((t) => t.memberNameEn === "Jung Kook"));
  assert.ok(byAlias.templates.every((t) => t.groupSlug === "bts"));
  assert.ok(byAlias.templates.every((t) => t.status === "published"));

  const byAlbumAlias = await search("阿里郎");
  assert.ok(byAlbumAlias.templates.length >= 21);
  assert.ok(byAlbumAlias.templates.every((t) => t.releaseTitle === "ARIRANG"));

  const byGroupAlias = await search("心心");
  assert.ok(byGroupAlias.templates.length > 0);
  assert.ok(byGroupAlias.templates.every((t) => t.groupSlug === "h2h"));

  const miss = await search("definitely-not-an-album-xyz");
  assert.equal(miss.templates.length, 0);
  assert.equal(miss.empty, true);
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

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("PC07 custom card write without auth is 401", async () => {
  const prev = token;
  token = "";
  const res = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({ imageFrontBase64: TINY_PNG, title: "nope" }),
  });
  token = prev;
  assert.equal(res.status, 401);
});

test("PC01-PC06 private photo custom cards", async () => {
  const templatesBefore = await query("SELECT COUNT(*)::int AS n FROM templates");
  const progBefore = await api("/collection/groups/bts/progress");
  const ownedBefore = (progBefore.body as { ownedDistinct: number }).ownedDistinct;

  const created = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "PC_CUSTOM_UNIQUE_TOKEN",
      note: "私人拍照",
      quantity: 1,
      condition: "near_mint",
      groupId: GROUP_BTS,
    }),
  });
  assert.equal(created.status, 200);
  const card = created.body as {
    id: string;
    kind: string;
    custom: boolean;
    badge: string;
    imageFront: string;
    moderationStatus: string;
    moderationLabel: string;
    groupId: string;
    condition: string;
    moderation: { hookReady: boolean; submitted: boolean };
  };
  assert.equal(card.kind, "custom");
  assert.equal(card.custom, true);
  assert.equal(card.badge, "自定义");
  assert.equal(card.moderationStatus, "pending");
  assert.equal(card.moderationLabel, "审核中");
  assert.equal(card.condition, "near_mint");
  assert.equal(card.moderation.hookReady, true);
  assert.ok(card.imageFront.startsWith("/media/custom/"));

  const templatesAfter = await query("SELECT COUNT(*)::int AS n FROM templates");
  assert.equal(templatesAfter.rows[0].n, templatesBefore.rows[0].n);
  const row = await query("SELECT 1 FROM user_custom_cards WHERE id = $1 AND user_id = $2", [
    card.id,
    userId,
  ]);
  assert.equal(row.rowCount, 1);

  const search = await api("/catalog/search?q=PC_CUSTOM_UNIQUE_TOKEN");
  assert.equal(search.status, 200);
  const found = (search.body as { templates: { name?: string; title?: string }[] }).templates;
  assert.equal(found.length, 0);

  const catalog = await api("/catalog/templates");
  const catalogIds = (catalog.body as { templates: { id: string }[] }).templates.map((t) => t.id);
  assert.ok(!catalogIds.includes(card.id));

  const progAfter = await api("/collection/groups/bts/progress");
  assert.equal((progAfter.body as { ownedDistinct: number }).ownedDistinct, ownedBefore);

  const overview = await api("/collection/overview");
  const ov = overview.body as {
    customCount: number;
    customBadge: string;
    customLabel: string;
    customCards: { id: string; badge: string; moderationStatus: string }[];
    groups: { slug: string; progress: { ownedDistinct: number }; customCount: number; customBadge: string | null }[];
  };
  assert.equal(ov.customBadge, "自定义");
  assert.ok(ov.customCount >= 1);
  assert.match(ov.customLabel, /自定义/);
  assert.ok(ov.customCards.some((c) => c.id === card.id && c.badge === "自定义"));
  const bts = ov.groups.find((g) => g.slug === "bts");
  assert.equal(bts?.progress.ownedDistinct, ownedBefore);
  assert.ok((bts?.customCount || 0) >= 1);
  assert.equal(bts?.customBadge, "自定义");

  const group = await api("/collection/groups/bts");
  const gbody = group.body as {
    custom: { id: string; badge: string }[];
    customCount: number;
    owned: { id: string }[];
    wanted: { id: string }[];
  };
  assert.ok(gbody.custom.some((c) => c.id === card.id));
  assert.ok(!gbody.owned.some((c) => c.id === card.id));
  assert.ok(!gbody.wanted.some((c) => c.id === card.id));

  const want = await api("/collection/wants", {
    method: "POST",
    body: JSON.stringify({ templateId: card.id }),
  });
  assert.equal(want.status, 404);

  const img = await fetch(base + card.imageFront);
  assert.equal(img.status, 200);

  const sharePending = await api("/share/image", {
    method: "POST",
    body: JSON.stringify({ groupId: "bts" }),
  });
  assert.equal(sharePending.status, 200);
  const shareP = sharePending.body as {
    cardCount: number;
    templateIds: string[];
    customCardIds: string[];
    truncated: boolean;
  };
  assert.equal(shareP.truncated, false);
  assert.ok(shareP.customCardIds.includes(card.id));
  assert.equal(shareP.cardCount, shareP.templateIds.length + shareP.customCardIds.length);

  await query("UPDATE user_custom_cards SET moderation_status = 'rejected' WHERE id = $1", [card.id]);
  const overviewRejected = await api("/collection/overview");
  const ovR = overviewRejected.body as { customCards: { id: string }[] };
  assert.ok(!ovR.customCards.some((c) => c.id === card.id));
  const groupRejected = await api("/collection/groups/bts");
  assert.ok(!(groupRejected.body as { custom: { id: string }[] }).custom.some((c) => c.id === card.id));

  const shareRejected = await api("/share/image", {
    method: "POST",
    body: JSON.stringify({ groupId: "bts" }),
  });
  const shareR = shareRejected.body as { customCardIds: string[]; truncated: boolean; cardCount: number };
  assert.equal(shareR.truncated, false);
  assert.ok(!shareR.customCardIds.includes(card.id));

  await query(
    "UPDATE user_custom_cards SET moderation_status = 'pending', moderation_trace_id = $2 WHERE id = $1",
    [card.id, "trace-pc05"],
  );
  const hook = await api("/webhooks/wx-media-check", {
    method: "POST",
    body: JSON.stringify({ trace_id: "trace-pc05", result: { suggest: "pass" } }),
  });
  assert.equal(hook.status, 200);
  const approved = await api(`/collection/custom-cards/${card.id}`);
  assert.equal((approved.body as { moderationStatus: string }).moderationStatus, "approved");

  const del = await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
  assert.equal(del.status, 200);
  const gone = await query("SELECT 1 FROM user_custom_cards WHERE id = $1", [card.id]);
  assert.equal(gone.rowCount, 0);
});

test("custom card DELETE requires auth and is owner-only", async () => {
  const created = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "DELETE_OWNER_ONLY",
    }),
  });
  assert.equal(created.status, 200);
  const card = created.body as { id: string };
  assert.ok(card.id);

  const ownerToken = token;
  token = "";
  const unauth = await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
  token = ownerToken;
  assert.equal(unauth.status, 401);
  const stillThere = await query("SELECT 1 FROM user_custom_cards WHERE id = $1 AND user_id = $2", [
    card.id,
    userId,
  ]);
  assert.equal(stillThere.rowCount, 1);

  const otherLogin = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:other-custom-card-owner" }),
  });
  assert.equal(otherLogin.status, 200);
  const otherToken = (otherLogin.body as { token: string }).token;
  token = otherToken;
  const otherGet = await api(`/collection/custom-cards/${card.id}`);
  const otherDel = await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
  token = ownerToken;
  assert.equal(otherGet.status, 404);
  assert.equal(otherDel.status, 404);
  const notStolen = await query("SELECT 1 FROM user_custom_cards WHERE id = $1 AND user_id = $2", [
    card.id,
    userId,
  ]);
  assert.equal(notStolen.rowCount, 1);

  const missing = await api("/collection/custom-cards/00000000-0000-4000-8000-000000000000", {
    method: "DELETE",
  });
  assert.equal(missing.status, 404);

  const ownerDel = await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
  assert.equal(ownerDel.status, 200);
  assert.equal((ownerDel.body as { deleted: boolean }).deleted, true);
  const gone = await query("SELECT 1 FROM user_custom_cards WHERE id = $1", [card.id]);
  assert.equal(gone.rowCount, 0);

  const again = await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
  assert.equal(again.status, 404);
});

test("UX03-UX05 custom card optional member_id and group membership", async () => {
  const memberRm = sid("member:bts:RM");
  const memberCarmen = sid("member:h2h:Carmen");

  const members = await api("/catalog/groups/bts/members");
  assert.equal(members.status, 200);
  const list = (members.body as { members: { id: string; nameEn: string; groupId: string }[] }).members;
  assert.ok(list.some((m) => m.id === memberRm && m.nameEn === "RM"));
  assert.ok(list.every((m) => m.groupId && m.nameEn));

  const skipMember = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "UX03_SKIP_MEMBER",
      groupId: GROUP_BTS,
    }),
  });
  assert.equal(skipMember.status, 200);
  const skipped = skipMember.body as { id: string; memberId: string | null; member: unknown; groupId: string };
  assert.equal(skipped.groupId, GROUP_BTS);
  assert.equal(skipped.memberId, null);
  assert.equal(skipped.member, null);
  const skipRow = await query("SELECT member_id FROM user_custom_cards WHERE id = $1", [skipped.id]);
  assert.equal(skipRow.rows[0].member_id, null);

  const withMember = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "UX04_WITH_MEMBER",
      groupId: GROUP_BTS,
      memberId: memberRm,
    }),
  });
  assert.equal(withMember.status, 200);
  const picked = withMember.body as {
    id: string;
    memberId: string;
    memberNameEn: string;
    member: { id: string; nameEn: string };
    imageFront: string;
  };
  assert.equal(picked.memberId, memberRm);
  assert.equal(picked.memberNameEn, "RM");
  assert.equal(picked.member.id, memberRm);
  const dbMember = await query("SELECT member_id, group_id FROM user_custom_cards WHERE id = $1", [picked.id]);
  assert.equal(String(dbMember.rows[0].member_id), memberRm);
  assert.equal(String(dbMember.rows[0].group_id), GROUP_BTS);

  const detail = await api(`/collection/custom-cards/${picked.id}`);
  assert.equal((detail.body as { memberId: string; imageFront: string }).memberId, memberRm);
  assert.ok((detail.body as { imageFront: string }).imageFront.startsWith("/media/custom/"));

  const overview = await api("/collection/overview");
  const ov = overview.body as { customCards: { id: string; memberId: string; memberNameEn: string }[] };
  const ovCard = ov.customCards.find((c) => c.id === picked.id);
  assert.equal(ovCard?.memberId, memberRm);
  assert.equal(ovCard?.memberNameEn, "RM");

  const wrongGroup = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      groupId: GROUP_BTS,
      memberId: memberCarmen,
    }),
  });
  assert.equal(wrongGroup.status, 400);

  const memberNoGroup = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      memberId: memberRm,
    }),
  });
  assert.equal(memberNoGroup.status, 400);

  const switched = await api(`/collection/custom-cards/${picked.id}`, {
    method: "PATCH",
    body: JSON.stringify({ groupId: GROUP_H2H }),
  });
  assert.equal(switched.status, 200);
  const afterSwitch = switched.body as { groupId: string; memberId: string | null };
  assert.equal(afterSwitch.groupId, GROUP_H2H);
  assert.equal(afterSwitch.memberId, null);
  const switchedRow = await query("SELECT member_id FROM user_custom_cards WHERE id = $1", [picked.id]);
  assert.equal(switchedRow.rows[0].member_id, null);

  const restored = await api(`/collection/custom-cards/${picked.id}`, {
    method: "PATCH",
    body: JSON.stringify({ groupId: GROUP_BTS, memberId: memberRm }),
  });
  assert.equal((restored.body as { memberId: string }).memberId, memberRm);
  const cleared = await api(`/collection/custom-cards/${picked.id}`, {
    method: "PATCH",
    body: JSON.stringify({ memberId: null }),
  });
  assert.equal((cleared.body as { memberId: string | null }).memberId, null);

  const templatesBefore = await query("SELECT COUNT(*)::int AS n FROM templates");
  const prog = await api("/collection/groups/bts/progress");
  const owned = (prog.body as { ownedDistinct: number }).ownedDistinct;
  const search = await api("/catalog/search?q=UX04_WITH_MEMBER");
  const found = (search.body as { templates: unknown[] }).templates;
  assert.equal(found.length, 0);
  const templatesAfter = await query("SELECT COUNT(*)::int AS n FROM templates");
  assert.equal(templatesAfter.rows[0].n, templatesBefore.rows[0].n);
  const progAfter = await api("/collection/groups/bts/progress");
  assert.equal((progAfter.body as { ownedDistinct: number }).ownedDistinct, owned);

  await api(`/collection/custom-cards/${skipped.id}`, { method: "DELETE" });
  await api(`/collection/custom-cards/${picked.id}`, { method: "DELETE" });
});

test("PCX04-PCX07 optional custom-card album/benefit metadata stays private", async () => {
  const arirang = sid("release:bts:arirang");
  const chase = sid("release:h2h:the-chase");
  const templatesBefore = await query("SELECT COUNT(*)::int AS n FROM templates");

  const emptyMeta = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "PCX04_EMPTY_META",
      groupId: GROUP_BTS,
    }),
  });
  assert.equal(emptyMeta.status, 200);
  const emptyCard = emptyMeta.body as {
    id: string;
    releaseId: string | null;
    benefitName: string | null;
    versionLabel: string | null;
  };
  assert.equal(emptyCard.releaseId, null);
  assert.equal(emptyCard.benefitName, null);
  assert.equal(emptyCard.versionLabel, null);

  const filled = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      title: "PCX06_META_TOKEN",
      groupId: GROUP_BTS,
      releaseId: arirang,
      benefitName: "Weverse POB",
      versionLabel: "A ver.",
    }),
  });
  assert.equal(filled.status, 200, JSON.stringify(filled.body));
  const card = filled.body as {
    id: string;
    releaseId: string;
    releaseTitle: string;
    benefitName: string;
    versionLabel: string;
  };
  assert.equal(card.releaseId, arirang);
  assert.equal(card.releaseTitle, "ARIRANG");
  assert.equal(card.benefitName, "Weverse POB");
  assert.equal(card.versionLabel, "A ver.");

  const row = await query(
    "SELECT release_id, benefit_name, version_label FROM user_custom_cards WHERE id = $1",
    [card.id],
  );
  assert.equal(String(row.rows[0].release_id), arirang);
  assert.equal(row.rows[0].benefit_name, "Weverse POB");
  assert.equal(row.rows[0].version_label, "A ver.");

  const detail = await api(`/collection/custom-cards/${card.id}`);
  const shown = detail.body as {
    releaseId: string;
    releaseTitle: string;
    benefitName: string;
    versionLabel: string;
  };
  assert.equal(shown.releaseId, arirang);
  assert.equal(shown.benefitName, "Weverse POB");
  assert.equal(shown.versionLabel, "A ver.");

  const noGroupRelease = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      releaseId: arirang,
    }),
  });
  assert.equal(noGroupRelease.status, 400);

  const wrongGroup = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: TINY_PNG,
      mimeType: "image/png",
      groupId: GROUP_BTS,
      releaseId: chase,
    }),
  });
  assert.equal(wrongGroup.status, 400);

  const patched = await api(`/collection/custom-cards/${card.id}`, {
    method: "PATCH",
    body: JSON.stringify({ groupId: GROUP_H2H }),
  });
  assert.equal(patched.status, 200);
  const afterSwitch = patched.body as { groupId: string; releaseId: string | null };
  assert.equal(afterSwitch.groupId, GROUP_H2H);
  assert.equal(afterSwitch.releaseId, null);

  const restored = await api(`/collection/custom-cards/${card.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      groupId: GROUP_BTS,
      releaseId: arirang,
      benefitName: "KMS",
      versionLabel: "B",
    }),
  });
  assert.equal((restored.body as { benefitName: string; versionLabel: string }).benefitName, "KMS");
  assert.equal((restored.body as { versionLabel: string }).versionLabel, "B");
  assert.equal((restored.body as { releaseId: string }).releaseId, arirang);

  const templatesAfter = await query("SELECT COUNT(*)::int AS n FROM templates");
  assert.equal(templatesAfter.rows[0].n, templatesBefore.rows[0].n);
  const search = await api("/catalog/search?q=PCX06_META_TOKEN");
  assert.equal((search.body as { templates: unknown[] }).templates.length, 0);
  const catalog = await api("/catalog/templates");
  const catalogIds = (catalog.body as { templates: { id: string }[] }).templates.map((t) => t.id);
  assert.ok(!catalogIds.includes(card.id));

  await api(`/collection/custom-cards/${emptyCard.id}`, { method: "DELETE" });
  await api(`/collection/custom-cards/${card.id}`, { method: "DELETE" });
});
