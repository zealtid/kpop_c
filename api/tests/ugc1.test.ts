/**
 * UGC-1 U1-01…11 API 行为
 * 待审不进公开图鉴 / 完成度；通过后挂拥有；驳回清 pending 图。
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { submissionTemplateDedupeKey } from "../src/catalogSubmissions.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { config } from "../src/config.js";
import { GROUP_H2H, sid } from "../src/ids.js";
import { templateDedupeKey } from "../src/admin.js";
import type { Server } from "node:http";

let server: Server;
let base = "";
let token = "";
let userId = "";
const adminHeaders = { "Content-Type": "application/json", "x-admin-token": "dev-admin" };
const CHASE = sid("release:h2h:the-chase");
const CARMEN = sid("member:h2h:Carmen");

async function api(pathName: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token && !headers.Authorization && !headers["x-admin-token"]) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(base + pathName, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* raw */
  }
  return { status: res.status, body };
}

async function jpeg(seedN: number) {
  const r = 40 + (seedN % 180);
  const g = 80 + ((seedN * 3) % 140);
  const b = 120 + ((seedN * 7) % 100);
  const badge = await sharp({
    create: { width: 90, height: 90, channels: 3, background: { r: seedN % 255, g: 20, b: 200 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 240, height: 360, channels: 3, background: { r, g, b } },
  })
    .composite([{ input: badge, top: 20 + (seedN % 40), left: 20 + (seedN % 30) }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function uploadFront(n: number, side: "front" | "back" = "front") {
  const buf = await jpeg(n);
  const res = await api("/media/ugc-pending", {
    method: "POST",
    body: JSON.stringify({ imageBase64: buf.toString("base64"), mimeType: "image/jpeg", side }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as { path: string; thumbPath: string; warnings: unknown[] };
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
    body: JSON.stringify({ code: "mock:ugc1" }),
  });
  token = (login.body as { token: string; user: { id: string } }).token;
  userId = (login.body as { user: { id: string } }).user.id;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("U1-01 non-whitelist group cannot submit", async () => {
  const closedId = sid("group:ugc-closed");
  await query(
    `INSERT INTO idol_groups (id, slug, name_zh, name_en, name_ko, logo_color, is_pilot, status, ugc_open)
     VALUES ($1,'closed-ugc','关闭团','Closed','닫힘','#111111',true,'published',false)`,
    [closedId],
  );
  const relId = sid("release:closed-ugc:x");
  await query(
    `INSERT INTO releases (id, group_id, title, released_on, kind, status)
     VALUES ($1,$2,'X','2026-01-01','album','published')`,
    [relId, closedId],
  );
  const front = await uploadFront(1);
  const res = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: closedId,
      releaseId: relId,
      versionLabel: "A",
      slotLabel: "卡1",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(res.status, 400);
  assert.equal((res.body as { error: { code: string } }).error.code, "UGC_CLOSED");
});

test("GET /catalog/groups?ugc_open=1 only open groups", async () => {
  const res = await api("/catalog/groups?ugc_open=1");
  assert.equal(res.status, 200);
  const groups = (res.body as { groups: { slug: string; ugcOpen: boolean }[] }).groups;
  assert.ok(groups.every((g) => g.ugcOpen));
  assert.ok(groups.some((g) => g.slug === "h2h"));
  assert.ok(!groups.some((g) => g.slug === "closed-ugc"));
});

test("U1-02/03/09 submit front-only + list pending + warnings", async () => {
  const noAgree = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      versionLabel: "Photobook A",
      slotLabel: "UGC Carmen 1",
      imageFront: "/media/ugc-pending/nope",
      agreementAccepted: false,
    }),
  });
  assert.equal(noAgree.status, 400);

  const front = await uploadFront(11);
  const res = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "Photobook A",
      slotLabel: "UGC Carmen 1",
      imageFront: front.path,
      imageFrontThumb: front.thumbPath,
      agreementAccepted: true,
    }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const created = res.body as { id: string; status: string; warnings?: { code: string }[] };
  assert.equal(created.status, "pending_review");
  assert.ok(Array.isArray(created.warnings));

  const list = await api("/me/catalog-submissions");
  const items = (list.body as { submissions: { status: string }[] }).submissions;
  assert.ok(items.some((s) => s.status === "pending_review"));
});

test("U1-04 pending does not enter completeness denominator", async () => {
  const before = await api(`/collection/groups/${GROUP_H2H}/progress`);
  assert.equal(before.status, 200);
  const n = (before.body as { publishedCount: number }).publishedCount;
  const front = await uploadFront(61);
  await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Pending-Only",
      slotLabel: "Pending only",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  const after = await api(`/collection/groups/${GROUP_H2H}/progress`);
  assert.equal((after.body as { publishedCount: number }).publishedCount, n);
});

test("U1-05/08/10 approve creates published template and grants own", async () => {
  const front = await uploadFront(21);
  const created = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Ver-New",
      slotLabel: "UGC New Slot",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  const approved = await api(`/admin/catalog-submissions/${id}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const resultId = (approved.body as { resultTemplateId: string }).resultTemplateId;
  assert.ok(resultId);

  const tpl = await api(`/catalog/templates?q=${encodeURIComponent("UGC New Slot")}`);
  const templates = (tpl.body as { templates: { id: string; status: string; mainImageUrl?: string }[] }).templates;
  const published = templates.find((t) => t.id === resultId && t.status === "published");
  assert.ok(published);
  assert.ok(published.mainImageUrl && published.mainImageUrl.startsWith("/media/cards/"));

  const imgRes = await fetch(base + published.mainImageUrl);
  assert.equal(imgRes.status, 200);
  assert.match(imgRes.headers.get("content-type") || "", /^image\//);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  assert.ok(bytes.length > 100);

  const owned = await api(`/collection/cards/${resultId}`);
  assert.equal(owned.status, 200);
});

test("U1-06 reject deletes pending image and shows reason", async () => {
  const front = await uploadFront(31);
  const created = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Reject",
      slotLabel: "UGC Reject Slot",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  const id = (created.body as { id: string }).id;
  const rel = front.path.replace("/media/ugc-pending/", "");
  const local = path.join(config.dataDir, "ugc-pending", rel);
  assert.equal(fs.existsSync(local), true);

  const rejected = await api(`/admin/catalog-submissions/${id}/reject`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ reason: "图不对" }),
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(fs.existsSync(local), false);

  const mine = await api(`/me/catalog-submissions/${id}`);
  assert.equal((mine.body as { rejectReason: string }).rejectReason, "图不对");
});

test("approve-path dedupe key includes slot; import key does not", () => {
  const importKey = templateDedupeKey("h2h", "The Chase", "Carmen", "Ver-A");
  const approveKey = submissionTemplateDedupeKey("h2h", "The Chase", "Carmen", "Ver-A", "Slot  1");
  assert.equal(importKey, "h2h:The Chase:Carmen:Ver-A");
  assert.equal(approveKey, "h2h:The Chase:Carmen:Ver-A:slot 1");
  assert.notEqual(importKey, approveKey);
});

test("U1-07 merge keeps official image unless adopt_submission_image", async () => {
  const frontA = await uploadFront(41);
  const a = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Merge",
      slotLabel: "UGC Merge Slot",
      imageFront: frontA.path,
      agreementAccepted: true,
    }),
  });
  const idA = (a.body as { id: string }).id;
  const first = await api(`/admin/catalog-submissions/${idA}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  const templateId = (first.body as { resultTemplateId: string }).resultTemplateId;
  const before = await query("SELECT main_image_url FROM templates WHERE id = $1", [templateId]);
  const official = before.rows[0].main_image_url;

  const frontB = await uploadFront(42);
  const b = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Merge",
      slotLabel: "UGC Merge Slot",
      imageFront: frontB.path,
      agreementAccepted: true,
    }),
  });
  const idB = (b.body as { id: string }).id;
  const merged = await api(`/admin/catalog-submissions/${idB}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ mergeTemplateId: templateId, adoptSubmissionImage: false }),
  });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.equal((merged.body as { resultTemplateId: string }).resultTemplateId, templateId);
  const kept = await query("SELECT main_image_url FROM templates WHERE id = $1", [templateId]);
  assert.equal(kept.rows[0].main_image_url, official);

  const frontC = await uploadFront(43);
  const c = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Merge",
      slotLabel: "UGC Merge Slot",
      imageFront: frontC.path,
      agreementAccepted: true,
    }),
  });
  const idC = (c.body as { id: string }).id;
  await api(`/admin/catalog-submissions/${idC}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ mergeTemplateId: templateId, adoptSubmissionImage: true }),
  });
  const swapped = await query("SELECT main_image_url FROM templates WHERE id = $1", [templateId]);
  assert.notEqual(swapped.rows[0].main_image_url, official);
});

test("approve two pending cards same member+version different slots creates two templates", async () => {
  const version = "UGC-Distinct-Slots";
  const frontA = await uploadFront(201);
  const frontB = await uploadFront(202);
  const a = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "Carmen Slot A",
      imageFront: frontA.path,
      agreementAccepted: true,
    }),
  });
  const b = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "Carmen Slot B",
      imageFront: frontB.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const idA = (a.body as { id: string }).id;
  const idB = (b.body as { id: string }).id;

  const approvedA = await api(`/admin/catalog-submissions/${idA}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  const approvedB = await api(`/admin/catalog-submissions/${idB}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(approvedA.status, 200, JSON.stringify(approvedA.body));
  assert.equal(approvedB.status, 200, JSON.stringify(approvedB.body));
  const tplA = (approvedA.body as { resultTemplateId: string }).resultTemplateId;
  const tplB = (approvedB.body as { resultTemplateId: string }).resultTemplateId;
  assert.ok(tplA);
  assert.ok(tplB);
  assert.notEqual(tplA, tplB);

  const rows = await query(
    "SELECT id, name, version, status, dedupe_key, main_image_url FROM templates WHERE id = ANY($1::uuid[])",
    [[tplA, tplB]],
  );
  assert.equal(rows.rowCount, 2);
  const byId = new Map(rows.rows.map((r) => [String(r.id), r]));
  assert.equal(byId.get(tplA)?.status, "published");
  assert.equal(byId.get(tplB)?.status, "published");
  assert.equal(byId.get(tplA)?.name, "Carmen Slot A");
  assert.equal(byId.get(tplB)?.name, "Carmen Slot B");
  assert.equal(byId.get(tplA)?.version, version);
  assert.equal(byId.get(tplB)?.version, version);
  assert.equal(byId.get(tplA)?.dedupe_key, submissionTemplateDedupeKey("h2h", "The Chase", "Carmen", version, "Carmen Slot A"));
  assert.equal(byId.get(tplB)?.dedupe_key, submissionTemplateDedupeKey("h2h", "The Chase", "Carmen", version, "Carmen Slot B"));
  assert.ok(String(byId.get(tplA)?.main_image_url || "").startsWith("/media/cards/"));
  assert.ok(String(byId.get(tplB)?.main_image_url || "").startsWith("/media/cards/"));
});

test("approve does not silent-merge into published short import dedupe_key", async () => {
  const version = "UGC-Short-Key-No-Merge";
  const existingId = randomUUID();
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,$3,'UGC-SHORT','Official Short',$4,false,false,'published','/media/cards/short-key.png',$5)`,
    [existingId, CHASE, CARMEN, version, templateDedupeKey("h2h", "The Chase", "Carmen", version)],
  );
  const front = await uploadFront(205);
  const created = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "UGC Long Slot",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const approved = await api(`/admin/catalog-submissions/${(created.body as { id: string }).id}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const resultId = (approved.body as { resultTemplateId: string }).resultTemplateId;
  assert.notEqual(resultId, existingId);
  const createdRow = await query("SELECT name, dedupe_key, status FROM templates WHERE id = $1", [resultId]);
  assert.equal(createdRow.rows[0].status, "published");
  assert.equal(createdRow.rows[0].name, "UGC Long Slot");
  assert.equal(
    createdRow.rows[0].dedupe_key,
    submissionTemplateDedupeKey("h2h", "The Chase", "Carmen", version, "UGC Long Slot"),
  );
});

test("approve different slots with explicit mergeTemplateId stays one template", async () => {
  const version = "UGC-Explicit-Merge-Slots";
  const frontA = await uploadFront(203);
  const a = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "Merge Slot A",
      imageFront: frontA.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const first = await api(`/admin/catalog-submissions/${(a.body as { id: string }).id}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const templateId = (first.body as { resultTemplateId: string }).resultTemplateId;
  const before = await query("SELECT main_image_url FROM templates WHERE id = $1", [templateId]);
  const official = before.rows[0].main_image_url;

  const frontB = await uploadFront(204);
  const b = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "Merge Slot B",
      imageFront: frontB.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const merged = await api(`/admin/catalog-submissions/${(b.body as { id: string }).id}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ mergeTemplateId: templateId, adoptSubmissionImage: false }),
  });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.equal((merged.body as { resultTemplateId: string }).resultTemplateId, templateId);
  const kept = await query("SELECT id, main_image_url FROM templates WHERE version = $1 AND status = 'published'", [
    version,
  ]);
  assert.equal(kept.rowCount, 1);
  assert.equal(kept.rows[0].id, templateId);
  assert.equal(kept.rows[0].main_image_url, official);
});

test("merge fills empty official main image without adopt flag", async () => {
  const tplId = randomUUID();
  const version = "UGC-Empty-Main";
  await query(
    `INSERT INTO templates (id, release_id, member_id, code, name, version, is_benefit, is_deprecated, status, main_image_url, dedupe_key)
     VALUES ($1,$2,$3,'UGC-EMPTY','Empty Main',$4,false,false,'published',NULL,'h2h:The Chase:Carmen:UGC-Empty-Main')`,
    [tplId, CHASE, CARMEN, version],
  );
  const front = await uploadFront(71);
  const created = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: version,
      slotLabel: "Empty Main Slot",
      imageFront: front.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { id: string }).id;
  const approved = await api(`/admin/catalog-submissions/${id}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ mergeTemplateId: tplId, adoptSubmissionImage: false }),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const row = await query("SELECT main_image_url FROM templates WHERE id = $1", [tplId]);
  assert.match(String(row.rows[0].main_image_url || ""), /^\/media\/cards\//);
  const imgRes = await fetch(base + String(row.rows[0].main_image_url));
  assert.equal(imgRes.status, 200);
});

test("U1-08 apply-catalog copies into pending prefix and keeps custom card", async () => {
  const buf = await jpeg(51);
  const custom = await api("/collection/custom-cards", {
    method: "POST",
    body: JSON.stringify({
      imageFrontBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      title: "私人申请",
      versionLabel: "UGC-Apply",
    }),
  });
  assert.equal(custom.status, 200, JSON.stringify(custom.body));
  const customId = (custom.body as { id: string }).id;
  const customFront = (custom.body as { imageFront: string }).imageFront;
  const applied = await api(`/collection/custom-cards/${customId}/apply-catalog`, {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "UGC-Apply",
      slotLabel: "私人申请",
      agreementAccepted: true,
    }),
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const sub = applied.body as { imageFront: string; source: string; customCardId: string };
  assert.equal(sub.source, "from_custom_card");
  assert.ok(sub.imageFront.startsWith("/media/ugc-pending/"));
  assert.notEqual(sub.imageFront, customFront);
  const still = await api(`/collection/custom-cards/${customId}`);
  assert.equal(still.status, 200);
});

test("U1-11 report + unpublish", async () => {
  const listed = await api("/admin/catalog-submissions?status=approved", { headers: adminHeaders });
  const rows = (listed.body as { submissions: { resultTemplateId: string | null }[] }).submissions;
  const tid = rows.find((s) => s.resultTemplateId)?.resultTemplateId;
  assert.ok(tid);
  const report = await api(`/catalog/templates/${tid}/report`, {
    method: "POST",
    body: JSON.stringify({ text: "盗图" }),
  });
  assert.equal(report.status, 200);
  const unpub = await api(`/admin/templates/${tid}/unpublish`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(unpub.status, 200);
  assert.equal((unpub.body as { status: string }).status, "draft");
});

test("P3-04/05/06 first approval +1, reject 0, no historical backfill needed", async () => {
  const meBefore = await api("/me");
  const beforePts = Number((meBefore.body as { contributionPoints?: number }).contributionPoints) || 0;

  const frontOk = await uploadFront(91);
  const createdOk = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "P3-Points-Ok",
      slotLabel: "P3 Points Card",
      imageFront: frontOk.path,
      agreementAccepted: true,
    }),
  });
  assert.equal(createdOk.status, 200, JSON.stringify(createdOk.body));
  const idOk = (createdOk.body as { id: string }).id;
  const approved = await api(`/admin/catalog-submissions/${idOk}/approve`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal((approved.body as { pointsAwarded: number }).pointsAwarded, 1);

  const meAfterApprove = await api("/me");
  assert.equal((meAfterApprove.body as { contributionPoints: number }).contributionPoints, beforePts + 1);

  const frontNo = await uploadFront(92);
  const createdNo = await api("/catalog/submissions", {
    method: "POST",
    body: JSON.stringify({
      groupId: GROUP_H2H,
      releaseId: CHASE,
      memberId: CARMEN,
      versionLabel: "P3-Points-No",
      slotLabel: "P3 Reject Card",
      imageFront: frontNo.path,
      agreementAccepted: true,
    }),
  });
  const idNo = (createdNo.body as { id: string }).id;
  const rejected = await api(`/admin/catalog-submissions/${idNo}/reject`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ reason: "不计分" }),
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal((rejected.body as { pointsAwarded: number }).pointsAwarded, 0);

  const meAfterReject = await api("/me");
  assert.equal((meAfterReject.body as { contributionPoints: number }).contributionPoints, beforePts + 1);

  const listed = await api(`/admin/users?q=${encodeURIComponent(userId)}`, { headers: adminHeaders });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const users = (listed.body as { users: { id: string; contributionPoints: number }[] }).users;
  const row = users.find((u) => u.id === userId);
  assert.ok(row);
  assert.equal(row!.contributionPoints, beforePts + 1);

  const detail = await api(`/admin/users/${userId}`, { headers: adminHeaders });
  assert.equal(detail.status, 200);
  assert.equal((detail.body as { contributionPoints: number }).contributionPoints, beforePts + 1);

  const hist = await api(`/admin/users/${userId}/submissions`, { headers: adminHeaders });
  assert.equal(hist.status, 200);
  const subs = (hist.body as { submissions: { id: string; pointsAwarded: number }[] }).submissions;
  assert.ok(subs.some((s) => s.id === idOk && s.pointsAwarded === 1));
  assert.ok(subs.some((s) => s.id === idNo && s.pointsAwarded === 0));
});
