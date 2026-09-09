import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_BTS, GROUP_H2H, sid } from "../src/ids.js";
import { GUEST_FEED_LIMIT } from "../src/feed.js";
import { shanghaiDayUtcRange, shanghaiIso } from "../src/time.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
let token = "";
let userId = "";

const adminHeaders = {
  "Content-Type": "application/json",
  "x-admin-token": "dev-admin",
};

async function api(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
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

  const login = await api("/auth/wx-login", {
    method: "POST",
    body: JSON.stringify({ code: "mock:m2a-collector" }),
  });
  assert.equal(login.status, 200);
  const data = login.body as { token: string; user: { id: string } };
  token = data.token;
  userId = data.user.id;
  const fol = await api("/me/follows", {
    method: "PUT",
    body: JSON.stringify({ groupIds: [GROUP_BTS] }),
  });
  assert.equal(fol.status, 200);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

type FeedItem = {
  id: string;
  title: string;
  trustLevel: string;
  status: string;
  isMachineTranslated: boolean;
  source?: string | null;
  sourceNote?: string | null;
  url?: string | null;
  canonicalUrl?: string | null;
  groupIds: string[];
  featured?: boolean;
};

type FeedRes = { items: FeedItem[]; timeline: string; guestLimit?: number; trustFilter: string[] };

test("F01 publish L1 feed for followed group appears with source/url", async () => {
  const created = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "F01 BTS L1 官方公告",
      summary: "验收 F01",
      category: "official",
      trustLevel: "L1",
      canonicalUrl: "https://ibighit.com/bts/f01",
      sourceNote: "HYBE 官方",
      status: "published",
      featured: false,
      groupIds: [GROUP_BTS],
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const item = created.body as FeedItem;
  assert.equal(item.status, "published");
  assert.equal(item.trustLevel, "L1");

  const tl = await api("/feed");
  assert.equal(tl.status, 200);
  const body = tl.body as FeedRes;
  assert.equal(body.timeline, "followed");
  assert.deepEqual(body.trustFilter, ["L1"]);
  const found = body.items.find((x) => x.id === item.id);
  assert.ok(found, "L1 published feed for followed group must appear");
  assert.equal(found!.source, "HYBE 官方");
  assert.equal(found!.sourceNote, "HYBE 官方");
  assert.equal(found!.url, "https://ibighit.com/bts/f01");
  assert.equal(found!.canonicalUrl, "https://ibighit.com/bts/f01");
  assert.ok(found!.groupIds.includes(GROUP_BTS));
});

test("F02 L3 and hidden never appear on main timeline", async () => {
  const l3 = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "F02 L3 rumor",
      trustLevel: "L3",
      status: "published",
      featured: true,
      groupIds: [GROUP_BTS],
      canonicalUrl: "https://example.com/l3",
      sourceNote: "unverified",
    }),
  });
  assert.equal(l3.status, 200);
  const hidden = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "F02 hidden L1",
      trustLevel: "L1",
      status: "hidden",
      featured: true,
      groupIds: [GROUP_BTS],
      canonicalUrl: "https://example.com/hidden",
      sourceNote: "ops hide",
    }),
  });
  assert.equal(hidden.status, 200);
  const l2 = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "F02 L2 gated",
      trustLevel: "L2",
      status: "published",
      featured: true,
      groupIds: [GROUP_BTS],
      canonicalUrl: "https://example.com/l2",
      sourceNote: "community",
    }),
  });
  assert.equal(l2.status, 200);

  const tl = await api("/feed");
  const ids = (tl.body as FeedRes).items.map((x) => x.id);
  assert.ok(!ids.includes((l3.body as FeedItem).id));
  assert.ok(!ids.includes((hidden.body as FeedItem).id));
  assert.ok(!ids.includes((l2.body as FeedItem).id), "L2 gated unless whitelist");

  const prev = token;
  token = "";
  const featured = await api("/feed");
  token = prev;
  const gids = (featured.body as FeedRes).items.map((x) => x.id);
  assert.ok(!gids.includes((l3.body as FeedItem).id));
  assert.ok(!gids.includes((hidden.body as FeedItem).id));
  assert.ok(!gids.includes((l2.body as FeedItem).id));
});

test("F03 machine-translated flag is returned", async () => {
  const created = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "F03 translated",
      trustLevel: "L1",
      status: "published",
      isMachineTranslated: true,
      groupIds: ["bts"],
      sourceNote: "Weverse KR",
      canonicalUrl: "https://weverse.io/bts/f03",
    }),
  });
  assert.equal(created.status, 200);
  assert.equal((created.body as FeedItem).isMachineTranslated, true);

  const tl = await api("/feed");
  const found = (tl.body as FeedRes).items.find((x) => x.id === (created.body as FeedItem).id);
  assert.ok(found);
  assert.equal(found!.isMachineTranslated, true);

  const seedBts = sid("feed:bts:l1-sample");
  const seeded = (tl.body as FeedRes).items.find((x) => x.id === seedBts);
  assert.ok(seeded, "seed L1 BTS feed should be on followed timeline");
  assert.equal(seeded!.isMachineTranslated, true);
});

test("S01/S02 schedule today+list visible and decoupled from catalog Event", async () => {
  const tables = await query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const names = tables.rows.map((r) => r.tablename as string);
  assert.ok(names.includes("schedule_events"));
  assert.ok(names.includes("feed_items"));
  assert.ok(names.includes("releases"));
  assert.ok(!names.includes("events"), "must not invent catalog Event table");

  const { start } = shanghaiDayUtcRange();
  const startAt = new Date(start.getTime() + 15 * 3600 * 1000);
  const created = await api("/admin/schedule", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      groupId: "bts",
      title: "S01 BTS 门票开售",
      startAt: startAt.toISOString(),
      kind: "ticket_sale",
      timezoneNote: "KST",
      sourceUrl: "https://weverse.io/bts/ticket",
      trustLevel: "L1",
      status: "published",
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const ev = created.body as {
    id: string;
    kind: string;
    startAt: string;
    startAtShanghai: string;
    timezone: string;
    releaseId: string | null;
  };
  assert.equal(ev.kind, "ticket_sale");
  assert.equal(ev.timezone, "Asia/Shanghai");
  assert.equal(ev.startAtShanghai, shanghaiIso(startAt));
  assert.equal(ev.releaseId, null);

  const today = await api("/schedule/today");
  assert.equal(today.status, 200);
  const todayBody = today.body as { dateShanghai: string; events: { id: string; kind: string }[] };
  assert.ok(todayBody.events.some((x) => x.id === ev.id));
  assert.ok(todayBody.events.some((x) => x.kind === "ticket_sale"));

  const list = await api("/schedule?groupId=bts");
  assert.equal(list.status, 200);
  const listBody = list.body as { events: { id: string }[] };
  assert.ok(listBody.events.some((x) => x.id === ev.id));

  const live = await api("/admin/schedule", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      groupId: GROUP_H2H,
      title: "S02 H2H live",
      startAt: new Date(start.getTime() + 20 * 3600 * 1000).toISOString(),
      endAt: new Date(start.getTime() + 21 * 3600 * 1000).toISOString(),
      kind: "live",
      status: "published",
      trustLevel: "L1",
    }),
  });
  assert.equal(live.status, 200);

  const hidden = await api(`/admin/schedule/${(live.body as { id: string }).id}/hide`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(hidden.status, 200);
  assert.equal((hidden.body as { status: string }).status, "hidden");

  const guestPrev = token;
  token = "";
  const guestToday = await api("/schedule/today?groupId=h2h");
  token = guestPrev;
  assert.ok(
    !(guestToday.body as { events: { id: string }[] }).events.some(
      (x) => x.id === (live.body as { id: string }).id,
    ),
  );

  const catalogEvents = await query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('events', 'catalog_events')`,
  );
  assert.equal(catalogEvents.rows[0].n, 0);
});

test("guest featured L1 is limited", async () => {
  for (let i = 0; i < GUEST_FEED_LIMIT + 3; i++) {
    const r = await api("/admin/feed", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        title: `guest featured ${i}`,
        trustLevel: "L1",
        status: "published",
        featured: true,
        groupIds: [GROUP_H2H],
        sourceNote: "ops",
        canonicalUrl: `https://example.com/guest/${i}`,
      }),
    });
    assert.equal(r.status, 200);
  }
  const prev = token;
  token = "";
  const featured = await api("/feed");
  token = prev;
  assert.equal(featured.status, 200);
  const body = featured.body as FeedRes;
  assert.equal(body.timeline, "featured");
  assert.equal(body.guestLimit, GUEST_FEED_LIMIT);
  assert.ok(body.items.length <= GUEST_FEED_LIMIT);
  assert.ok(body.items.length > 0);
  assert.ok(body.items.every((x) => x.trustLevel === "L1"));
  assert.ok(body.items.every((x) => x.isMachineTranslated === true || x.isMachineTranslated === false));
});

test("X01-ish: no crawler config or subscribe-message worker endpoints", async () => {
  const prev = token;
  token = "";
  const paths = [
    "/crawler",
    "/crawler/config",
    "/admin/crawler",
    "/admin/crawler/config",
    "/subscribe-message",
    "/subscribe-message/worker",
    "/notify/worker",
    "/admin/subscribe",
    "/admin/subscribe-message",
  ];
  for (const p of paths) {
    const res = await api(p);
    assert.equal(res.status, 404, p);
    const adminRes = await fetch(base + p, { headers: { "x-admin-token": "dev-admin" } });
    assert.equal(adminRes.status, 404, `admin ${p}`);
  }
  token = prev;
});

test("admin feed/schedule require ADMIN_TOKEN", async () => {
  const prev = token;
  token = "";
  const feed = await api("/admin/feed", { method: "POST", body: JSON.stringify({ title: "x" }) });
  const sched = await api("/admin/schedule", { method: "POST", body: JSON.stringify({ title: "x" }) });
  token = prev;
  assert.equal(feed.status, 401);
  assert.equal(sched.status, 401);
});

test("draft→published via admin; L2 only with whitelist", async () => {
  const draft = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "draft then publish",
      trustLevel: "L1",
      status: "draft",
      groupIds: [GROUP_BTS],
      sourceNote: "ops",
      canonicalUrl: "https://example.com/draft",
    }),
  });
  assert.equal(draft.status, 200);
  assert.equal((draft.body as FeedItem).status, "draft");
  const before = await api("/feed");
  assert.ok(!(before.body as FeedRes).items.some((x) => x.id === (draft.body as FeedItem).id));

  const published = await api(`/admin/feed/${(draft.body as FeedItem).id}/publish`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(published.status, 200);
  assert.equal((published.body as FeedItem).status, "published");
  const after = await api("/feed");
  assert.ok((after.body as FeedRes).items.some((x) => x.id === (draft.body as FeedItem).id));

  const l2 = await api("/admin/feed", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "L2 whitelist only",
      trustLevel: "L2",
      status: "published",
      groupIds: [GROUP_BTS],
      sourceNote: "ops L2",
      canonicalUrl: "https://example.com/l2-wl",
    }),
  });
  const l2id = (l2.body as FeedItem).id;
  const noWl = await api("/feed");
  assert.ok(!(noWl.body as FeedRes).items.some((x) => x.id === l2id));

  const wl = await api("/admin/feed/l2-whitelist", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ userId }),
  });
  assert.equal(wl.status, 200);
  const withWl = await api("/feed");
  assert.ok((withWl.body as FeedRes).trustFilter.includes("L2"));
  assert.ok((withWl.body as FeedRes).items.some((x) => x.id === l2id));

  await api(`/admin/feed/l2-whitelist/${userId}`, { method: "DELETE", headers: adminHeaders });
});
