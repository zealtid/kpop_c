import "./shareFont.js";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { optionalAuth, requireAuth, wxLogin, getUser, publicUser, updateUser } from "./auth.js";
import { requireAdmin, requireOpsSession, loginOps, getOpsMe, clearOpsCookie, setOpsCookie } from "./opsAuth.js";
import { listAuditLogs, writeAuditLog } from "./audit.js";
import * as catalog from "./catalog.js";
import * as collection from "./collection.js";
import { createShareImage } from "./share.js";
import * as admin from "./admin.js";
import { ANALYTICS_EVENTS, track } from "./analytics.js";
import { query } from "./db.js";
import * as customCards from "./customCards.js";
import { applyMediaCheckResult } from "./moderation.js";
import { isSafeCustomMediaParams, readCustomImage } from "./storage.js";
import * as feed from "./feed.js";
import * as schedule from "./schedule.js";
import { parseUtc } from "./time.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "8mb" }));
  app.use(optionalAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "kpop_c-api", phase: "M2.5-OPS-0" });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "星卡 API",
      client: "WeChat mini-program + ops admin",
      docs: "see repository README",
      phase: "M2.5-OPS-0",
    });
  });

  // ---- auth ----
  app.post("/auth/wx-login", async (req, res, next) => {
    try {
      res.json(await wxLogin(String(req.body?.code || "")));
    } catch (e) {
      next(e);
    }
  });

  app.get("/me", requireAuth, async (req, res, next) => {
    try {
      res.json(publicUser(await getUser(req.user!.id)));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/me", requireAuth, async (req, res, next) => {
    try {
      const user = await updateUser(req.user!.id, {
        nickname: req.body?.nickname,
        privacy: req.body?.privacy,
        avatarUrl: req.body?.avatarUrl,
      });
      res.json(publicUser(user));
    } catch (e) {
      next(e);
    }
  });

  app.get("/me/follows", requireAuth, async (req, res, next) => {
    try {
      res.json({ groups: await collection.getFollows(req.user!.id) });
    } catch (e) {
      next(e);
    }
  });

  app.put("/me/follows", requireAuth, async (req, res, next) => {
    try {
      res.json({ groups: await collection.setFollows(req.user!.id, req.body?.groupIds || []) });
    } catch (e) {
      next(e);
    }
  });

  // ---- catalog (guest readable) ----
  app.get("/catalog/groups", async (_req, res, next) => {
    try {
      res.json({ groups: await catalog.listGroups() });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id);
      const members = await catalog.listMembers(group.id as string);
      const releases = await catalog.listReleases(group.id as string);
      res.json({ group, members, releases });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id/members", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id);
      res.json({ members: await catalog.listMembers(group.id as string) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id/releases", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id);
      res.json({ releases: await catalog.listReleases(group.id as string) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/releases/:id/templates", async (req, res, next) => {
    try {
      const templates = await catalog.searchTemplates({ releaseId: req.params.id });
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/templates", async (req, res, next) => {
    try {
      const templates = await catalog.searchTemplates({
        q: req.query.q as string | undefined,
        groupId: req.query.groupId as string | undefined,
        releaseId: req.query.releaseId as string | undefined,
        memberId: req.query.memberId as string | undefined,
        userId: req.user?.id,
      });
      res.json({ templates, searchOn: "catalog" });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/search", async (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      const templates = await catalog.searchTemplates({
        q,
        groupId: req.query.groupId as string | undefined,
        userId: req.user?.id,
      });
      res.json({ q, templates, empty: templates.length === 0 });
    } catch (e) {
      next(e);
    }
  });

  // ---- collection ----
  app.get("/collection/overview", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.overview(req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  app.get("/collection/groups/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.groupDetail(req.user!.id, req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.get("/collection/groups/:id/progress", requireAuth, async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id);
      const [p] = await collection.progressForGroups(req.user!.id, [group.id as string]);
      res.json({
        group,
        ownedDistinct: p?.owned_distinct ?? 0,
        publishedCount: p?.published_count ?? 0,
        benefitCount: p?.benefit_count ?? 0,
        copy: collection.PROGRESS_COPY,
        footnote: group.scopeNote,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/collection/cards", requireAuth, async (req, res, next) => {
    try {
      const items = req.body?.items || (req.body?.templateId ? [req.body] : []);
      res.json(await collection.ownCards(req.user!.id, items));
    } catch (e) {
      next(e);
    }
  });

  app.post("/collection/cards/batch", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.ownCards(req.user!.id, req.body?.items || req.body?.owns || []));
    } catch (e) {
      next(e);
    }
  });

  app.get("/collection/cards/:templateId", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.getOwnedCard(req.user!.id, req.params.templateId));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/collection/cards/:templateId", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.updateOwnedCard(req.user!.id, req.params.templateId, req.body || {}));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/collection/cards/:templateId", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.removeOwn(req.user!.id, req.params.templateId));
    } catch (e) {
      next(e);
    }
  });

  app.get("/collection/wants", requireAuth, async (req, res, next) => {
    try {
      const r = await query(
        `SELECT t.id FROM user_wants w JOIN templates t ON t.id = w.template_id WHERE w.user_id = $1`,
        [req.user!.id],
      );
      res.json({ templateIds: r.rows.map((x) => x.id) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/collection/wants", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.addWant(req.user!.id, req.body?.templateId));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/collection/wants/:templateId", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.removeWant(req.user!.id, req.params.templateId));
    } catch (e) {
      next(e);
    }
  });

  // ---- custom cards (M1.5 私人拍照加卡) ----
  app.get("/collection/custom-cards", requireAuth, async (req, res, next) => {
    try {
      const groupId = (req.query.groupId as string) || undefined;
      const includeRejected = String(req.query.includeRejected || "") === "1";
      const cards = await customCards.listCustomCards(req.user!.id, { groupId, includeRejected });
      res.json({
        cards,
        customBadge: customCards.CUSTOM_BADGE,
        customCount: cards.filter((c) => c.moderationStatus !== "rejected").length,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/collection/custom-cards", requireAuth, async (req, res, next) => {
    try {
      res.json(
        await customCards.createCustomCard(req.user!.id, req.body || {}, req.user!.wxOpenid),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/collection/custom-cards/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await customCards.getCustomCard(req.user!.id, req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/collection/custom-cards/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await customCards.updateCustomCard(req.user!.id, req.params.id, req.body || {}));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/collection/custom-cards/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await customCards.deleteCustomCard(req.user!.id, req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.get("/webhooks/wx-media-check", (req, res) => {
    res.type("text").send(String(req.query.echostr || "ok"));
  });

  app.post("/webhooks/wx-media-check", async (req, res, next) => {
    try {
      const body = req.body || {};
      const traceId = String(body.trace_id || body.traceId || "");
      const suggest = body.result?.suggest || body.suggest;
      const updated = await applyMediaCheckResult({
        traceId: traceId || undefined,
        suggest,
        customCardId: body.customCardId,
      });
      res.json({ ok: true, updated: updated || null });
    } catch (e) {
      next(e);
    }
  });

  // ---- share ----
  app.post("/share/image", requireAuth, async (req, res, next) => {
    try {
      res.json(await createShareImage(req.user!.id, req.body?.groupId || req.body?.group));
    } catch (e) {
      next(e);
    }
  });

  app.get("/share/landing", (req, res) => {
    res.type("html").send(
      `<!doctype html><meta charset="utf-8"><title>星卡</title>
       <body style="font-family:sans-serif;padding:24px">请使用微信打开星卡小程序（M1 无 Web 客户端）。group=${String(req.query.g || "")}</body>`,
    );
  });

  // ---- feed (M2-a: API only, no mini-program UI) ----
  app.get("/feed", async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      if (req.user) {
        res.json(await feed.followedTimeline(req.user.id, limit));
      } else {
        res.json(await feed.guestFeatured(limit));
      }
    } catch (e) {
      next(e);
    }
  });

  app.get("/feed/featured", async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(await feed.guestFeatured(limit));
    } catch (e) {
      next(e);
    }
  });

  app.get("/feed/:id", async (req, res, next) => {
    try {
      res.json(await feed.getPublicFeed(req.params.id, req.user?.id));
    } catch (e) {
      next(e);
    }
  });

  // ---- schedule (UTC store, Asia/Shanghai display) ----
  app.get("/schedule/today", async (req, res, next) => {
    try {
      res.json(
        await schedule.scheduleToday(req.user?.id, req.query.groupId as string | undefined),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/schedule", async (req, res, next) => {
    try {
      const from = req.query.from ? parseUtc(req.query.from, "from") : undefined;
      const to = req.query.to ? parseUtc(req.query.to, "to") : undefined;
      res.json(
        await schedule.listSchedule({
          userId: req.user?.id,
          groupId: req.query.groupId as string | undefined,
          from,
          to,
          kind: req.query.kind as string | undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/schedule/:id", async (req, res, next) => {
    try {
      res.json(await schedule.getPublicSchedule(req.params.id, req.user?.id));
    } catch (e) {
      next(e);
    }
  });

  // ---- feedback (text only) ----
  app.post("/feedback/missing", requireAuth, async (req, res, next) => {
    try {
      const body = String(req.body?.text || req.body?.body || "").trim();
      if (!body) throw new AppError(400, "BAD_REQUEST", "请填写文字反馈");
      if (req.body?.image || req.body?.file || req.body?.images) {
        throw new AppError(400, "TEXT_ONLY", "缺卡反馈仅支持文字");
      }
      const r = await query(
        "INSERT INTO missing_feedback (user_id, body) VALUES ($1, $2) RETURNING id, created_at",
        [req.user!.id, body],
      );
      await track("missing_feedback_submit", { length: body.length }, req.user!.id);
      res.json({ id: r.rows[0].id, createdAt: r.rows[0].created_at });
    } catch (e) {
      next(e);
    }
  });

  // ---- admin auth (OPS-0: username/password + allowlist; no WeChat QR / SSO) ----
  app.post("/admin/auth/login", async (req, res, next) => {
    try {
      const result = await loginOps(String(req.body?.username || ""), String(req.body?.password || ""));
      setOpsCookie(res, result.token);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/auth/me", requireOpsSession, async (req, res, next) => {
    try {
      res.json(await getOpsMe(req));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/auth/logout", requireOpsSession, async (req, res, next) => {
    try {
      clearOpsCookie(res);
      if (req.ops?.via === "jwt") {
        await writeAuditLog({
          actor: req.ops,
          action: "ops.logout",
          entityType: "ops_user",
          entityId: req.ops.id,
        });
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/audit", requireAdmin, async (req, res, next) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json({ logs: await listAuditLogs(limit) });
    } catch (e) {
      next(e);
    }
  });

  // ---- admin ----
  app.post("/admin/import", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.importCatalog(req.body);
      await writeAuditLog({
        actor: req.ops,
        action: "catalog.import",
        entityType: "release",
        entityId: result.releaseId,
        payload: { groupSlug: req.body?.groupSlug, count: result.count },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/publish", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.setTemplateStatus(req.params.id, "published");
      await writeAuditLog({
        actor: req.ops,
        action: "template.publish",
        entityType: "template",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/unpublish", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.setTemplateStatus(req.params.id, "draft");
      await writeAuditLog({
        actor: req.ops,
        action: "template.unpublish",
        entityType: "template",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.createDraftTemplate(req.body);
      await writeAuditLog({
        actor: req.ops,
        action: "template.create",
        entityType: "template",
        entityId: result.id,
        payload: { releaseId: req.body?.releaseId, version: req.body?.version },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/templates", requireAdmin, async (req, res, next) => {
    try {
      const templates = await catalog.searchTemplates({
        q: req.query.q as string | undefined,
        includeDraft: true,
      });
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/feed", requireAdmin, async (req, res, next) => {
    try {
      res.json({
        items: await feed.listAdminFeeds({
          status: req.query.status as string | undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/feed", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.createFeed(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "feed.create",
        entityType: "feed_item",
        entityId: result.id,
        payload: { title: req.body?.title, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/feed/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.updateFeed(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "feed.update",
        entityType: "feed_item",
        entityId: result.id,
        payload: { title: req.body?.title, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/feed/:id/publish", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.setFeedStatus(req.params.id, "published");
      await writeAuditLog({
        actor: req.ops,
        action: "feed.publish",
        entityType: "feed_item",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/feed/:id/hide", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.setFeedStatus(req.params.id, "hidden");
      await writeAuditLog({
        actor: req.ops,
        action: "feed.hide",
        entityType: "feed_item",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/feed/l2-whitelist", requireAdmin, async (req, res, next) => {
    try {
      res.json({ users: await feed.listL2Whitelist() });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/feed/l2-whitelist", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.addL2Whitelist(String(req.body?.userId || ""));
      await writeAuditLog({
        actor: req.ops,
        action: "feed.l2_whitelist.add",
        entityType: "feed_l2_whitelist",
        entityId: req.body?.userId,
        payload: { userId: req.body?.userId },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/feed/l2-whitelist/:userId", requireAdmin, async (req, res, next) => {
    try {
      const result = await feed.removeL2Whitelist(req.params.userId);
      await writeAuditLog({
        actor: req.ops,
        action: "feed.l2_whitelist.remove",
        entityType: "feed_l2_whitelist",
        entityId: req.params.userId,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/schedule", requireAdmin, async (req, res, next) => {
    try {
      res.json({
        events: await schedule.listAdminSchedule({
          status: req.query.status as string | undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/schedule", requireAdmin, async (req, res, next) => {
    try {
      const result = await schedule.createSchedule(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "schedule.create",
        entityType: "schedule_event",
        entityId: result.id,
        payload: { title: req.body?.title, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/schedule/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await schedule.updateSchedule(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "schedule.update",
        entityType: "schedule_event",
        entityId: result.id,
        payload: { title: req.body?.title, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/schedule/:id/publish", requireAdmin, async (req, res, next) => {
    try {
      const result = await schedule.setScheduleStatus(req.params.id, "published");
      await writeAuditLog({
        actor: req.ops,
        action: "schedule.publish",
        entityType: "schedule_event",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/schedule/:id/hide", requireAdmin, async (req, res, next) => {
    try {
      const result = await schedule.setScheduleStatus(req.params.id, "hidden");
      await writeAuditLog({
        actor: req.ops,
        action: "schedule.hide",
        entityType: "schedule_event",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // ---- analytics ----
  app.post("/analytics/events", optionalAuth, async (req, res, next) => {
    try {
      const name = String(req.body?.name || "");
      if (!ANALYTICS_EVENTS.includes(name as (typeof ANALYTICS_EVENTS)[number])) {
        throw new AppError(400, "BAD_REQUEST", "未知埋点");
      }
      await track(name, req.body?.payload || {}, req.user?.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // media
  app.get("/media/shares/:file", (req, res) => {
    const dest = path.join(config.dataDir, "shares", path.basename(req.params.file));
    if (!fs.existsSync(dest)) return res.status(404).end();
    res.type("png").sendFile(dest);
  });
  app.get("/media/cards/:file", (req, res) => {
    const dest = path.join(config.dataDir, "cards", path.basename(req.params.file));
    if (!fs.existsSync(dest)) return res.status(404).end();
    res.type("png").sendFile(dest);
  });
  app.get("/media/custom/:userId/:file", async (req, res, next) => {
    try {
      const { userId, file } = req.params;
      if (!isSafeCustomMediaParams(userId, file)) {
        res.status(404).end();
        return;
      }
      const publicPath = `/media/custom/${userId}/${file}`;
      const img = await readCustomImage(publicPath);
      if (!img) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.type(img.contentType).send(img.body);
    } catch (e) {
      next(e);
    }
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "服务器错误" } });
  });

  return app;
}
