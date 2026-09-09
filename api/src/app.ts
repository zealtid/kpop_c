import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { optionalAuth, requireAuth, requireAdmin, wxLogin, getUser, publicUser, updateUser } from "./auth.js";
import * as catalog from "./catalog.js";
import * as collection from "./collection.js";
import { createShareImage } from "./share.js";
import * as admin from "./admin.js";
import { ANALYTICS_EVENTS, track } from "./analytics.js";
import { query } from "./db.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(optionalAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "kpop_c-api", phase: "M1" });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "星卡 API",
      client: "WeChat mini-program only",
      docs: "see repository README",
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

  app.patch("/collection/cards/:templateId", requireAuth, async (req, res, next) => {
    try {
      res.json(await collection.updateQuantity(req.user!.id, req.params.templateId, Number(req.body?.quantity)));
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

  // ---- admin ----
  app.post("/admin/import", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.importCatalog(req.body));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/publish", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.setTemplateStatus(req.params.id, "published"));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/unpublish", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.setTemplateStatus(req.params.id, "draft"));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.createDraftTemplate(req.body));
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
