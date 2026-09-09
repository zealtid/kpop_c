import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { GROUP_BTS, GROUP_H2H, sid } from "../src/ids.js";
import { parseReleaseAllowlist } from "../src/catalogConstraints.js";
import { parseCsvText, parseImportInput } from "../src/importParse.js";
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

type Completeness = {
  groups: {
    slug: string;
    draftCount: number;
    publishedCount: number;
    missingMainImage: number;
    missingMembers: number;
    expansionGate: { status: string; signOff: null; blockers: { code: string }[] };
    constraint: { configured: boolean; allowedReleaseIds: string[] };
    releases: {
      id: string;
      title: string;
      draftCount: number;
      publishedCount: number;
      missingMainImage: number;
      missingMembers: { nameEn: string }[];
      inAllowedSlice: boolean | null;
      publishGate: { status: string; blockers: { code: string }[] };
    }[];
  }[];
};

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
  delete process.env.CATALOG_RELEASE_ALLOWLIST;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("parse CSV / markdown / allowlist helpers", () => {
  const grid = parseCsvText('a,b\n"x,y",z\n');
  assert.deepEqual(grid[0], ["a", "b"]);
  assert.deepEqual(grid[1], ["x,y", "z"]);
  const md = parseImportInput({
    format: "markdown",
    text: `---
groupSlug: bts
releaseTitle: ARIRANG
releasedOn: 2026-03-20
kind: album
---
| memberEn | version | status | mainImageUrl |
| --- | --- | --- | --- |
| RM | Standard | draft | /media/x.png |
`,
  });
  assert.equal(md.format, "markdown");
  assert.equal(md.rows[0].groupSlug, "bts");
  assert.equal(md.rows[0].memberEn, "RM");
  const map = parseReleaseAllowlist(`bts:${ARIRANG}`);
  assert.deepEqual(map.get("bts"), [ARIRANG]);
});

test("completeness and import require ops; x-admin-token still works", async () => {
  assert.equal((await api("/admin/completeness")).status, 401);
  assert.equal((await api("/admin/import/validate", { method: "POST", body: "{}" })).status, 401);
  const wx = await api("/auth/wx-login", { method: "POST", body: JSON.stringify({ code: "mock:ops2-wx" }) });
  const wxTok = (wx.body as { token: string }).token;
  assert.equal((await api("/admin/completeness", { headers: { Authorization: `Bearer ${wxTok}` } })).status, 401);

  const legacy = await api("/admin/completeness", { headers: { "x-admin-token": "dev-admin" } });
  assert.equal(legacy.status, 200);
  assert.ok(Array.isArray((legacy.body as Completeness).groups));
});

test("A06 completeness dashboard: draft vs published, missing image, missing members", async () => {
  const token = await opsToken();
  const before = await api("/admin/completeness", { headers: auth(token) });
  assert.equal(before.status, 200);
  const groups = (before.body as Completeness).groups;
  const bts = groups.find((g) => g.slug === "bts");
  const h2h = groups.find((g) => g.slug === "h2h");
  assert.ok(bts);
  assert.ok(h2h);
  const arirang = bts.releases.find((r) => r.id === ARIRANG);
  assert.ok(arirang);
  assert.ok(arirang.publishedCount >= 21);
  assert.equal(arirang.missingMembers.length, 0);
  assert.equal(bts.expansionGate.signOff, null);
  assert.equal(bts.constraint.configured, false);

  const chase = h2h.releases.find((r) => r.title === "The Chase");
  assert.ok(chase);
  assert.ok(chase.draftCount >= 1);
  assert.ok(chase.missingMainImage >= 1);

  const ghost = await api("/admin/catalog/members", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ groupId: GROUP_BTS, nameEn: "OPS2-Ghost", nameZh: "缺卡成员" }),
  });
  assert.equal(ghost.status, 200, JSON.stringify(ghost.body));
  const ghostId = (ghost.body as { id: string }).id;
  await api(`/admin/catalog/members/${ghostId}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });

  const draft = await api("/admin/catalog/templates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      releaseId: ARIRANG,
      memberId: RM,
      version: "OPS2-NoImg",
      name: "OPS2 No Image",
    }),
  });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));

  const after = await api("/admin/completeness", { headers: auth(token) });
  const btsAfter = (after.body as Completeness).groups.find((g) => g.slug === "bts")!;
  const arAfter = btsAfter.releases.find((r) => r.id === ARIRANG)!;
  assert.ok(arAfter.draftCount >= 1);
  assert.ok(arAfter.missingMainImage >= 1);
  assert.ok(arAfter.missingMembers.some((m) => m.nameEn === "OPS2-Ghost"));
  assert.ok(btsAfter.missingMembers >= 1);
  assert.ok(arAfter.publishGate.blockers.some((b) => b.code === "IMAGE_REQUIRED"));
  assert.ok(arAfter.publishGate.blockers.some((b) => b.code === "MISSING_MEMBERS"));
});

test("A07 BTS release slice constraint when configured", async () => {
  const token = await opsToken();
  process.env.CATALOG_RELEASE_ALLOWLIST = `bts:${ARIRANG}`;
  try {
    const created = await api("/admin/catalog/releases", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({
        groupId: GROUP_BTS,
        title: "Proof",
        releasedOn: "2022-06-10",
        kind: "album",
      }),
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const proofId = (created.body as { id: string; status: string }).id;
    assert.equal((created.body as { status: string }).status, "draft");

    const pub = await api(`/admin/catalog/releases/${proofId}/status`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ status: "published" }),
    });
    assert.equal(pub.status, 409);
    assert.equal((pub.body as { error: { code: string } }).error.code, "CATALOG_CONSTRAINT");

    const board = await api("/admin/completeness", { headers: auth(token) });
    const bts = (board.body as Completeness).groups.find((g) => g.slug === "bts")!;
    assert.equal(bts.constraint.configured, true);
    assert.ok(bts.constraint.allowedReleaseIds.includes(ARIRANG));
    assert.equal(bts.expansionGate.status, "blocked");
    assert.equal(bts.expansionGate.signOff, null);
    const proof = bts.releases.find((r) => r.id === proofId)!;
    assert.equal(proof.inAllowedSlice, false);
    assert.equal(proof.publishGate.status, "blocked");
    assert.ok(proof.publishGate.blockers.some((b) => b.code === "CATALOG_CONSTRAINT"));
    const arirang = bts.releases.find((r) => r.id === ARIRANG)!;
    assert.equal(arirang.inAllowedSlice, true);

    const expandImport = await api("/admin/import", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({
        groupSlug: "bts",
        releaseTitle: "Proof",
        releasedOn: "2022-06-10",
        kind: "album",
        templates: [{ memberEn: "RM", version: "OPS2-Proof", status: "draft" }],
      }),
    });
    assert.equal(expandImport.status, 400);
    assert.equal((expandImport.body as { error: { code: string } }).error.code, "IMPORT_INVALID");
    const report = (expandImport.body as { error: { details: { issues: { code: string }[] } } }).error.details;
    assert.ok(report.issues.some((i) => i.code === "CATALOG_CONSTRAINT"));

    const allowedImport = await api("/admin/import", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({
        groupSlug: "bts",
        releaseTitle: "ARIRANG",
        releasedOn: "2026-03-20",
        kind: "album",
        templates: [
          {
            memberEn: "RM",
            version: "OPS2-Slice-Ok",
            status: "draft",
            name: "OPS2 allowed slice",
          },
        ],
      }),
    });
    assert.equal(allowedImport.status, 200, JSON.stringify(allowedImport.body));
    assert.equal((allowedImport.body as { committed: boolean }).committed, true);

    const h2hRel = await api("/admin/catalog/releases", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({
        groupId: GROUP_H2H,
        title: "OPS2 H2H Extra",
        releasedOn: "2026-09-01",
        kind: "mini",
      }),
    });
    assert.equal(h2hRel.status, 200);
    const h2hId = (h2hRel.body as { id: string }).id;
    const h2hPub = await api(`/admin/catalog/releases/${h2hId}/status`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ status: "published" }),
    });
    assert.equal(h2hPub.status, 200, JSON.stringify(h2hPub.body));
  } finally {
    delete process.env.CATALOG_RELEASE_ALLOWLIST;
  }
});

test("CSV/Markdown validation report before commit; failures stay visible", async () => {
  const token = await opsToken();
  const csvBad = `groupSlug,releaseTitle,releasedOn,kind,memberEn,version,status,mainImageUrl
bts,ARIRANG,2026-03-20,album,RM,OPS2-Csv-Bad,published,
`;
  const dry = await api("/admin/import/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ format: "csv", text: csvBad }),
  });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  const dryBody = dry.body as { committed: boolean; report: { ok: boolean; issues: { code: string }[] } };
  assert.equal(dryBody.committed, false);
  assert.equal(dryBody.report.ok, false);
  assert.ok(dryBody.report.issues.some((i) => i.code === "IMAGE_REQUIRED"));
  const missing = await query("SELECT id FROM templates WHERE dedupe_key = $1", ["bts:ARIRANG:RM:OPS2-Csv-Bad"]);
  assert.equal(missing.rowCount, 0);

  const commitBad = await api("/admin/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ format: "csv", text: csvBad }),
  });
  assert.equal(commitBad.status, 400);
  assert.equal((commitBad.body as { error: { code: string } }).error.code, "IMPORT_INVALID");

  const csvOk = `groupSlug,releaseTitle,releasedOn,kind,memberEn,version,status,mainImageUrl,name
h2h,The Chase,2025-02-24,single,Carmen,OPS2-Csv-Ok,draft,,OPS2 CSV Ok
`;
  const committed = await api("/admin/import", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ format: "csv", text: csvOk }),
  });
  assert.equal(committed.status, 200, JSON.stringify(committed.body));
  assert.equal((committed.body as { committed: boolean; count: number }).committed, true);
  const row = await query("SELECT status FROM templates WHERE dedupe_key = $1", ["h2h:The Chase:Carmen:OPS2-Csv-Ok"]);
  assert.equal(row.rowCount, 1);
  assert.equal(row.rows[0].status, "draft");

  const md = await api("/admin/import/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      format: "markdown",
      text: `---
groupSlug: h2h
releaseTitle: The Chase
releasedOn: 2025-02-24
kind: single
---
| memberEn | version | status | name |
| --- | --- | --- | --- |
| Carmen | OPS2-Md-Ok | draft | OPS2 MD |
`,
    }),
  });
  assert.equal(md.status, 200);
  assert.equal((md.body as { report: { ok: boolean; format: string } }).report.ok, true);
  assert.equal((md.body as { report: { format: string } }).report.format, "markdown");

  const audit = await api("/admin/audit?limit=40", { headers: auth(token) });
  const logs = (audit.body as { logs: { action: string }[] }).logs;
  assert.ok(logs.some((l) => l.action === "catalog.import"));
});

test("release kind whitelist; C-side hides deprecated like draft", async () => {
  const token = await opsToken();
  const badKind = await api("/admin/catalog/releases", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      groupId: GROUP_H2H,
      title: "OPS2 Bad Kind",
      releasedOn: "2026-01-01",
      kind: "tour",
    }),
  });
  assert.equal(badKind.status, 400);

  const rel = await api("/admin/catalog/releases", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      groupId: GROUP_H2H,
      title: "OPS2 Deprecated Rel",
      releasedOn: "2026-02-02",
      kind: "concert_md",
    }),
  });
  assert.equal(rel.status, 200, JSON.stringify(rel.body));
  const id = (rel.body as { id: string }).id;
  const pub = await api(`/admin/catalog/releases/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(pub.status, 200);
  const listedPub = await api("/catalog/groups/h2h/releases");
  const titlesPub = (listedPub.body as { releases: { title: string }[] }).releases.map((r) => r.title);
  assert.ok(titlesPub.includes("OPS2 Deprecated Rel"));

  const dep = await api(`/admin/catalog/releases/${id}/status`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ status: "deprecated" }),
  });
  assert.equal(dep.status, 200);
  const listed = await api("/catalog/groups/h2h/releases");
  const titles = (listed.body as { releases: { title: string }[] }).releases.map((r) => r.title);
  assert.ok(!titles.includes("OPS2 Deprecated Rel"));
});
