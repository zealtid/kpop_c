/**
 * 收藏组合封面小卡（user_group_covers）
 * run: NODE_ENV=test DATABASE_URL=postgres://kpop:kpop@localhost:5432/kpop_c_test tsx --test tests/groupCovers.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_BTS, GROUP_H2H } from "../src/ids.js";

let server: Server;
let base = "";
let token = "";
let userId = "";

type Cover = {
  templateId: string | null;
  mainImageUrl: string | null;
  source: string;
};

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

async function templatesFor(groupId: string, limit = 3) {
  const r = await query<{ id: string; main_image_url: string | null }>(
    `SELECT t.id, t.main_image_url
     FROM templates t
     JOIN releases r ON r.id = t.release_id
     WHERE r.group_id = $1 AND t.status = 'published' AND t.is_deprecated = false
     ORDER BY t.code
     LIMIT $2`,
    [groupId, limit],
  );
  return r.rows;
}

before(async () => {
  await query("DROP SCHEMA public CASCADE");
  await query("CREATE SCHEMA public");
  await seed();
  const app = createApp();
  server = app.listen(0);
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;

  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:covers" }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const data = login.body as { token: string; user: { id: string } };
  token = data.token;
  userId = data.user.id;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("user_group_covers PK is (user_id, group_id) with FKs", async () => {
  const pk = await query<{ attname: string }>(
    `SELECT a.attname
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = 'user_group_covers'::regclass AND i.indisprimary
     ORDER BY a.attnum`,
  );
  assert.deepEqual(
    pk.rows.map((r) => r.attname),
    ["user_id", "group_id"],
  );
  const fks = await query<{ confrelid: string }>(
    `SELECT confrelid::regclass::text AS confrelid
     FROM pg_constraint
     WHERE conrelid = 'user_group_covers'::regclass AND contype = 'f'
     ORDER BY confrelid::regclass::text`,
  );
  const targets = fks.rows.map((r) => r.confrelid).sort();
  assert.ok(targets.includes("users"));
  assert.ok(targets.includes("idol_groups"));
  assert.ok(targets.includes("templates"));
});

test("overview cover is none without owned cards and never uses group icon", async () => {
  const overview = await api("/collection/overview");
  assert.equal(overview.status, 200);
  const bts = (
    overview.body as {
      groups: { slug: string; iconUrl?: string | null; cover: Cover }[];
    }
  ).groups.find((g) => g.slug === "bts");
  assert.ok(bts);
  assert.equal(bts.cover.source, "none");
  assert.equal(bts.cover.templateId, null);
  assert.equal(bts.cover.mainImageUrl, null);
});

test("unset cover falls back to latest owned; PUT pins user cover; unown clears", async () => {
  const btsCards = await templatesFor(GROUP_BTS, 3);
  const h2hCards = await templatesFor(GROUP_H2H, 1);
  assert.ok(btsCards.length >= 2);
  assert.ok(h2hCards.length >= 1);
  const first = btsCards[0];
  const second = btsCards[1];
  const otherGroup = h2hCards[0];

  const own = await api("/collection/cards/batch", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { templateId: first.id, quantity: 1 },
        { templateId: second.id, quantity: 1 },
        { templateId: otherGroup.id, quantity: 1 },
      ],
    }),
  });
  assert.equal(own.status, 200, JSON.stringify(own.body));

  await query(
    `UPDATE user_cards SET created_at = now() - interval '2 hours'
     WHERE user_id = $1 AND template_id = $2`,
    [userId, first.id],
  );
  await query(
    `UPDATE user_cards SET created_at = now() - interval '1 hour'
     WHERE user_id = $1 AND template_id = $2`,
    [userId, second.id],
  );

  const latest = await api("/collection/overview");
  const latestBts = (latest.body as { groups: { slug: string; cover: Cover }[] }).groups.find(
    (g) => g.slug === "bts",
  );
  assert.equal(latestBts?.cover.source, "latest");
  assert.equal(latestBts?.cover.templateId, second.id);
  assert.equal(latestBts?.cover.mainImageUrl, second.main_image_url);

  const badGroup = await api("/collection/groups/bts/cover", {
    method: "PUT",
    body: JSON.stringify({ templateId: otherGroup.id }),
  });
  assert.equal(badGroup.status, 400);

  const unowned = btsCards[2];
  assert.ok(unowned);
  const badOwn = await api("/collection/groups/bts/cover", {
    method: "PUT",
    body: JSON.stringify({ templateId: unowned.id }),
  });
  assert.equal(badOwn.status, 400);

  const setCover = await api("/collection/groups/bts/cover", {
    method: "PUT",
    body: JSON.stringify({ templateId: first.id }),
  });
  assert.equal(setCover.status, 200, JSON.stringify(setCover.body));
  const pinned = (setCover.body as { cover: Cover }).cover;
  assert.equal(pinned.source, "user");
  assert.equal(pinned.templateId, first.id);

  const post = await api("/collection/groups/bts/cover", {
    method: "POST",
    body: JSON.stringify({ templateId: first.id }),
  });
  assert.equal(post.status, 200);

  const got = await api("/collection/groups/bts/cover");
  assert.equal(got.status, 200);
  assert.equal((got.body as { cover: Cover }).cover.templateId, first.id);

  const detail = await api("/collection/groups/bts");
  const owned = (detail.body as { cover: Cover; owned: { id: string; isCover?: boolean }[] }).owned;
  assert.equal((detail.body as { cover: Cover }).cover.source, "user");
  assert.equal(owned.find((c) => c.id === first.id)?.isCover, true);
  assert.equal(owned.find((c) => c.id === second.id)?.isCover, false);

  const removed = await api(`/collection/cards/${first.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);

  const after = await api("/collection/overview");
  const afterBts = (after.body as { groups: { slug: string; cover: Cover }[] }).groups.find(
    (g) => g.slug === "bts",
  );
  assert.equal(afterBts?.cover.source, "latest");
  assert.equal(afterBts?.cover.templateId, second.id);

  const leftover = await query(
    "SELECT 1 FROM user_group_covers WHERE user_id = $1 AND group_id = $2",
    [userId, GROUP_BTS],
  );
  assert.equal(leftover.rowCount, 0);
});

test("trigger rejects cover template from another group", async () => {
  const h2h = await templatesFor(GROUP_H2H, 1);
  await assert.rejects(
    () =>
      query(
        `INSERT INTO user_group_covers (user_id, group_id, template_id)
         VALUES ($1, $2, $3)`,
        [userId, GROUP_BTS, h2h[0].id],
      ),
    /cover template does not belong to group/,
  );
});
