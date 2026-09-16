/**
 * Admin VLM 调用审计：写入 grid_vlm_calls + 按日聚合（窄测，需 Postgres）
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { pool, query } from "../src/db.js";
import { seed } from "../src/seed.js";
import { shanghaiDate } from "../src/time.js";
import { splitPhotocardGrid } from "../src/gridSplit.js";
import { attachVlmDetectLog, GRID_VLM_DETECT_PROMPT, MockGridVlmProvider } from "../src/vlm/index.js";
import {
  getGridVlmCall,
  GRID_VLM_LOG_TEXT_MAX_BYTES,
  insertGridVlmCall,
  listGridVlmCalls,
  listGridVlmStats,
} from "../src/vlm/calls.js";
import type { Server } from "node:http";

let server: Server;
let base = "";

async function tinyJpeg() {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 12, g: 24, b: 48 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

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

async function callCount(userId?: string) {
  if (userId) {
    const r = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM grid_vlm_calls WHERE user_id = $1`,
      [userId],
    );
    return Number(r.rows[0]?.n || 0);
  }
  const r = await query<{ n: string }>(`SELECT count(*)::text AS n FROM grid_vlm_calls`);
  return Number(r.rows[0]?.n || 0);
}

describe("grid_vlm_calls insert + stats", { concurrency: false }, () => {
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

  test("insertGridVlmCall writes prompt/raw without image / base64 / key", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const row = await insertGridVlmCall({
      userId: "user-insert-1",
      provider: "doubao",
      model: "doubao-seed-2-0-lite-260215",
      ok: true,
      detectedCount: 3,
      latencyMs: 812,
      meta: { boxCount: 3, confidenceAvg: 0.88 },
      promptText: "请找出图中每一张偶像小卡",
      rawText: '{"cards":[{"bbox":[10,20,30,40]}]}',
    });
    assert.equal(row.ok, true);
    assert.equal(row.reason, null);
    assert.equal(row.detectedCount, 3);
    assert.equal(row.userId, "user-insert-1");
    assert.equal(row.day, shanghaiDate());
    assert.equal(row.meta?.boxCount, 3);
    assert.equal("promptText" in row, false);
    assert.equal("rawText" in row, false);
    const stored = await query("SELECT * FROM grid_vlm_calls WHERE id = $1", [row.id]);
    const raw = stored.rows[0] as Record<string, unknown>;
    assert.equal(raw.ok, true);
    assert.equal(raw.prompt_text, "请找出图中每一张偶像小卡");
    assert.equal(raw.raw_text, '{"cards":[{"bbox":[10,20,30,40]}]}');
    assert.equal(raw.prompt_truncated, false);
    assert.equal(raw.raw_truncated, false);
    assert.ok(!("image" in raw) && !("image_base64" in raw) && !("api_key" in raw));
    const metaText = JSON.stringify(raw.meta || {});
    assert.ok(!/base64|sk-|ark-/i.test(metaText));
    assert.ok(Buffer.byteLength(metaText, "utf8") <= 8192);
  });

  test("insertGridVlmCall truncates oversized prompt/raw and redacts secrets", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const huge = "x".repeat(GRID_VLM_LOG_TEXT_MAX_BYTES + 64);
    const row = await insertGridVlmCall({
      userId: "user-trunc",
      provider: "doubao",
      model: "m",
      ok: false,
      reason: "vlm_fail",
      promptText: `data:image/jpeg;base64,QUFBQQ== ${huge}`,
      rawText: `Bearer sk-supersecretkey ${huge}`,
    });
    const stored = await query<{
      prompt_text: string;
      raw_text: string;
      prompt_truncated: boolean;
      raw_truncated: boolean;
    }>("SELECT prompt_text, raw_text, prompt_truncated, raw_truncated FROM grid_vlm_calls WHERE id = $1", [
      row.id,
    ]);
    const rec = stored.rows[0];
    assert.equal(rec.prompt_truncated, true);
    assert.equal(rec.raw_truncated, true);
    assert.ok(Buffer.byteLength(rec.prompt_text, "utf8") <= GRID_VLM_LOG_TEXT_MAX_BYTES);
    assert.ok(Buffer.byteLength(rec.raw_text, "utf8") <= GRID_VLM_LOG_TEXT_MAX_BYTES);
    assert.doesNotMatch(rec.prompt_text, /QUFBQQ|data:image/i);
    assert.doesNotMatch(rec.raw_text, /sk-supersecretkey/i);
  });

  test("listGridVlmStats aggregates ok / fail / no_cards / timeout / quota", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const today = shanghaiDate();
    await insertGridVlmCall({
      userId: "u-ok",
      provider: "doubao",
      model: "m",
      ok: true,
      detectedCount: 2,
      latencyMs: 100,
    });
    await insertGridVlmCall({
      userId: "u-ok",
      provider: "doubao",
      model: "m",
      ok: true,
      detectedCount: 4,
      latencyMs: 300,
    });
    await insertGridVlmCall({
      userId: "u-fail",
      provider: "doubao",
      model: "m",
      ok: false,
      reason: "vlm_fail",
      detectedCount: 0,
      latencyMs: 50,
      degrade: "ugc1",
    });
    await insertGridVlmCall({
      userId: "u-empty",
      provider: "doubao",
      model: "m",
      ok: false,
      reason: "no_cards",
      latencyMs: 80,
      degrade: "ugc1",
    });
    await insertGridVlmCall({
      userId: "u-to",
      provider: "doubao",
      model: "m",
      ok: false,
      reason: "timeout",
      latencyMs: 18000,
      degrade: "ugc1",
    });
    await insertGridVlmCall({
      userId: "u-q",
      provider: "doubao",
      model: "m",
      ok: false,
      reason: "quota",
      latencyMs: 0,
    });

    const stats = await listGridVlmStats({ from: today, to: today });
    assert.equal(stats.from, today);
    assert.equal(stats.to, today);
    assert.equal(stats.days.length, 1);
    const day = stats.days[0];
    assert.equal(day.calls, 6);
    assert.equal(day.ok, 2);
    assert.equal(day.fail, 1);
    assert.equal(day.noCards, 1);
    assert.equal(day.timeout, 1);
    assert.equal(day.quota, 1);
    assert.equal(day.sumDetected, 6);
    assert.equal(day.avgLatencyMs, Math.round((100 + 300 + 50 + 80 + 18000 + 0) / 6));
    assert.equal(stats.summary.calls, 6);
    assert.equal(stats.summary.ok, 2);

    const listed = await listGridVlmCalls({ from: today, to: today, reason: "quota", limit: 10 });
    assert.equal(listed.total, 1);
    assert.equal(listed.calls[0].reason, "quota");
    assert.equal(listed.calls[0].ok, false);
  });

  test("VLM success / no_cards / timeout insert; jsfeat does not", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const buf = await tinyJpeg();
    const body = {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    };

    const okRes = await splitPhotocardGrid(body, {
      userId: "u-detect-ok",
      provider: new MockGridVlmProvider(async () => {
        await new Promise((r) => setTimeout(r, 25));
        return {
          cards: [
            { bbox: [0.1, 0.1, 0.4, 0.55], confidence: 0.9 },
            { bbox: [0.5, 0.12, 0.88, 0.6], confidence: 0.8 },
          ],
          promptText: GRID_VLM_DETECT_PROMPT,
          rawText: "<bbox>80 100 420 620</bbox>\n<bbox>500 90 920 610</bbox>",
        };
      }),
    });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.detectedCount, 2);

    const empty = await splitPhotocardGrid(body, {
      userId: "u-detect-empty",
      provider: new MockGridVlmProvider(async () => ({
        cards: [],
        rawText: '{"cards":[]}',
      })),
    });
    assert.equal(empty.reason, "no_cards");

    const timeout = await splitPhotocardGrid(body, {
      userId: "u-detect-to",
      provider: new MockGridVlmProvider(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    });
    assert.equal(timeout.reason, "timeout");

    const failRaw = await splitPhotocardGrid(body, {
      userId: "u-detect-fail",
      provider: new MockGridVlmProvider(async () => {
        const err = new Error("vlm_http_500");
        err.name = "VlmHttpError";
        throw attachVlmDetectLog(err, {
          promptText: GRID_VLM_DETECT_PROMPT,
          rawText: '{"error":{"message":"boom"}}',
        });
      }),
    });
    assert.equal(failRaw.reason, "vlm_fail");

    const okRow = await query<{
      detected_count: number;
      ok: boolean;
      latency_ms: number;
      meta: unknown;
      prompt_text: string | null;
      raw_text: string | null;
    }>(
      `SELECT detected_count, ok, latency_ms, meta, prompt_text, raw_text FROM grid_vlm_calls WHERE user_id = $1`,
      ["u-detect-ok"],
    );
    assert.equal(okRow.rows.length, 1);
    assert.equal(okRow.rows[0].ok, true);
    assert.equal(Number(okRow.rows[0].detected_count), 2);
    assert.ok(Number(okRow.rows[0].latency_ms) >= 20);
    assert.equal((okRow.rows[0].meta as { boxCount?: number })?.boxCount, 2);
    assert.equal(okRow.rows[0].prompt_text, GRID_VLM_DETECT_PROMPT);
    assert.match(String(okRow.rows[0].raw_text), /<bbox>80 100 420 620<\/bbox>/);

    const emptyRow = await query<{ prompt_text: string | null; raw_text: string | null }>(
      `SELECT prompt_text, raw_text FROM grid_vlm_calls WHERE user_id = $1`,
      ["u-detect-empty"],
    );
    assert.equal(emptyRow.rows[0].prompt_text, GRID_VLM_DETECT_PROMPT);
    assert.equal(emptyRow.rows[0].raw_text, '{"cards":[]}');

    const failRow = await query<{ prompt_text: string | null; raw_text: string | null }>(
      `SELECT prompt_text, raw_text FROM grid_vlm_calls WHERE user_id = $1`,
      ["u-detect-fail"],
    );
    assert.equal(failRow.rows[0].prompt_text, GRID_VLM_DETECT_PROMPT);
    assert.equal(failRow.rows[0].raw_text, '{"error":{"message":"boom"}}');

    const toRow = await query<{ prompt_text: string | null; raw_text: string | null }>(
      `SELECT prompt_text, raw_text FROM grid_vlm_calls WHERE user_id = $1`,
      ["u-detect-to"],
    );
    assert.equal(toRow.rows[0].prompt_text, GRID_VLM_DETECT_PROMPT);
    assert.equal(toRow.rows[0].raw_text, null);

    assert.equal(await callCount("u-detect-empty"), 1);
    assert.equal(await callCount("u-detect-to"), 1);

    const beforeJsfeat = await callCount();
    await splitPhotocardGrid({
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      cells: 4,
    });
    assert.equal(await callCount(), beforeJsfeat);
  });

  test("quota 429 still inserts reason=quota", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const prev = process.env.GRID_VLM_DAILY_LIMIT;
    process.env.GRID_VLM_DAILY_LIMIT = "1";
    const buf = await tinyJpeg();
    const body = {
      imageBase64: buf.toString("base64"),
      mimeType: "image/jpeg",
      engine: "vlm",
      visionConsent: true,
    };
    const provider = new MockGridVlmProvider(async () => ({
      cards: [{ bbox: [0.1, 0.1, 0.4, 0.5], confidence: 0.7 }],
    }));
    try {
      const first = await splitPhotocardGrid(body, { userId: "u-quota", provider });
      assert.equal(first.ok, true);
      await assert.rejects(
        () => splitPhotocardGrid(body, { userId: "u-quota", provider }),
        /今日识别次数/,
      );
      const rows = await query<{ ok: boolean; reason: string | null }>(
        `SELECT ok, reason FROM grid_vlm_calls WHERE user_id = $1 ORDER BY created_at`,
        ["u-quota"],
      );
      assert.equal(rows.rows.length, 2);
      assert.equal(rows.rows[0].ok, true);
      assert.equal(rows.rows[1].ok, false);
      assert.equal(rows.rows[1].reason, "quota");
    } finally {
      if (prev != null) process.env.GRID_VLM_DAILY_LIMIT = prev;
      else delete process.env.GRID_VLM_DAILY_LIMIT;
    }
  });

  test("GET /admin/grid-vlm/stats and /calls use ops auth", async () => {
    await query("DELETE FROM grid_vlm_calls");
    const user = await query<{ id: string }>(
      `INSERT INTO users (wx_openid, nickname) VALUES ($1, $2) RETURNING id`,
      [`wx-vlm-${Date.now()}`, "宫格测试用户"],
    );
    const userId = user.rows[0].id;
    const row = await insertGridVlmCall({
      userId,
      provider: "doubao",
      model: "ep-test",
      ok: true,
      detectedCount: 1,
      latencyMs: 42,
      promptText: "请找出图中每一张偶像小卡",
      rawText: "<bbox>1 2 3 4</bbox>",
    });
    const today = shanghaiDate();
    const denied = await api(`/admin/grid-vlm/stats?from=${today}&to=${today}`);
    assert.equal(denied.status, 401);

    const stats = await api(`/admin/grid-vlm/stats?from=${today}&to=${today}`, {
      headers: { "x-admin-token": "dev-admin" },
    });
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    const body = stats.body as { summary: { calls: number; ok: number; sumDetected: number } };
    assert.equal(body.summary.calls, 1);
    assert.equal(body.summary.ok, 1);
    assert.equal(body.summary.sumDetected, 1);

    const calls = await api(`/admin/grid-vlm/calls?from=${today}&to=${today}&userId=${userId}`, {
      headers: { "x-admin-token": "dev-admin" },
    });
    assert.equal(calls.status, 200);
    const list = calls.body as {
      calls: {
        userId: string;
        model: string;
        userDisplayName: string | null;
        promptText?: string;
        rawText?: string;
      }[];
      total: number;
    };
    assert.equal(list.total, 1);
    assert.equal(list.calls[0].userId, userId);
    assert.equal(list.calls[0].model, "ep-test");
    assert.equal(list.calls[0].userDisplayName, "宫格测试用户");
    assert.equal("promptText" in list.calls[0], false);
    assert.equal("rawText" in list.calls[0], false);

    const detailDenied = await api(`/admin/grid-vlm/calls/${row.id}`);
    assert.equal(detailDenied.status, 401);

    const detail = await api(`/admin/grid-vlm/calls/${row.id}`, {
      headers: { "x-admin-token": "dev-admin" },
    });
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const one = detail.body as {
      userDisplayName: string | null;
      promptText: string | null;
      rawText: string | null;
      promptTruncated: boolean;
      model: string;
    };
    assert.equal(one.userDisplayName, "宫格测试用户");
    assert.equal(one.promptText, "请找出图中每一张偶像小卡");
    assert.equal(one.rawText, "<bbox>1 2 3 4</bbox>");
    assert.equal(one.promptTruncated, false);
    assert.equal(one.model, "ep-test");

    const mapped = await getGridVlmCall(row.id);
    assert.equal(mapped.userDisplayName, "宫格测试用户");
    assert.equal(mapped.promptText, "请找出图中每一张偶像小卡");

    const missing = await api(`/admin/grid-vlm/calls/00000000-0000-4000-8000-000000000099`, {
      headers: { "x-admin-token": "dev-admin" },
    });
    assert.equal(missing.status, 404);

    const legacy = await insertGridVlmCall({
      userId: "legacy-no-user",
      provider: "doubao",
      model: "ep-old",
      ok: true,
      detectedCount: 0,
      latencyMs: 1,
    });
    const legacyDetail = await getGridVlmCall(legacy.id);
    assert.equal(legacyDetail.userDisplayName, null);
    assert.equal(legacyDetail.promptText, null);
    assert.equal(legacyDetail.rawText, null);
    assert.equal(legacyDetail.promptTruncated, false);
    assert.equal(legacyDetail.rawTruncated, false);
  });
});
