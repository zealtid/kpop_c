import "./shareFont.js";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config, mockWxWebLoginEnabled } from "./config.js";
import { isAllowedCorsOrigin } from "./cors.js";
import { AppError } from "./errors.js";
import {
  optionalAuth,
  requireAuth,
  wxLogin,
  wxWebLogin,
  wxWebAuthorizeUrl,
  readWxWebState,
  h5AuthReturnUrl,
  getUser,
  publicUser,
  updateUser,
  saveUserAvatar,
} from "./auth.js";
import { requireAdmin, requireOpsSession, loginOps, getOpsMe, clearOpsCookie, setOpsCookie } from "./opsAuth.js";
import { listAuditLogs, writeAuditLog } from "./audit.js";
import * as catalog from "./catalog.js";
import * as collection from "./collection.js";
import { createShareImage } from "./share.js";
import { getShareSummary, h5LandingUrl, shareCta } from "./shareSummary.js";
import { renderShareLandingHtml } from "./shareLanding.js";
import * as admin from "./admin.js";
import * as adminCatalog from "./adminCatalog.js";
import { previewOrCommitImport } from "./importValidate.js";
import {
  createChannelEntry,
  disableChannelEntry,
  loadRuntimeChannelDictionary,
  updateChannelEntry,
} from "./channelDictionary.js";
import {
  deleteBenefitMapRow,
  listBenefitMaps,
  previewOrCommitBenefitMap,
  retireBenefitMapRow,
  upsertBenefitMapRow,
} from "./versionBenefit.js";
import { getReleaseBenefitMatrix, listLibraryBenefits } from "./benefitMatrix.js";
import { getCompletenessDashboard } from "./completeness.js";
import * as tickets from "./tickets.js";
import { ANALYTICS_EVENTS, track } from "./analytics.js";
import { query } from "./db.js";
import * as customCards from "./customCards.js";
import { applyMediaCheckResult } from "./moderation.js";
import {
  isPublicMediaKind,
  isSafeCardsMediaFile,
  isSafeCustomMediaParams,
  isSafePendingMediaParams,
  readCustomImage,
  readStoredImage,
  savePublicCatalogImage,
} from "./storage.js";
import * as catalogSubmissions from "./catalogSubmissions.js";
import * as gridSplit from "./gridSplit.js";
import * as adminUsers from "./adminUsers.js";
import { jsSdkSignature, resolveMiniJump } from "./wxMiniJump.js";
import * as feed from "./feed.js";
import * as schedule from "./schedule.js";
import { parseUtc } from "./time.js";

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin(origin, cb) {
        cb(null, isAllowedCorsOrigin(origin, config.corsOrigins));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "8mb" }));
  app.use(optionalAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "kpop_c-api", phase: "M2.5-OPS-3" });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "星卡 API",
      client: "WeChat mini-program + ops admin",
      docs: "see repository README",
      phase: "M2.5-OPS-3",
    });
  });

  // ---- auth ----
  app.post("/auth/wx-login", async (req, res, next) => {
    try {
      res.json(await wxLogin(String(req.body?.code || ""), { unionId: req.body?.unionId }));
    } catch (e) {
      next(e);
    }
  });

  app.post("/auth/wx-web-login", async (req, res, next) => {
    try {
      res.json(await wxWebLogin(String(req.body?.code || ""), { unionId: req.body?.unionId }));
    } catch (e) {
      next(e);
    }
  });

  app.get("/auth/wx-web/start", (req, res, next) => {
    try {
      const url = wxWebAuthorizeUrl(String(req.query.returnTo || req.query.return || ""));
      if (req.query.format === "json" || String(req.headers.accept || "").includes("application/json")) {
        res.json({ url, mock: !config.wxWebAppId || !config.wxWebSecret });
        return;
      }
      res.redirect(url);
    } catch (e) {
      next(e);
    }
  });

  app.get("/auth/wx-web/callback", async (req, res, next) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const parsed = state ? readWxWebState(state) : { typ: "wx-web" as const, returnTo: "/" };
      const result = await wxWebLogin(code);
      if (req.query.format === "json" || String(req.headers.accept || "").includes("application/json")) {
        res.json({ ...result, returnTo: parsed.returnTo || "/" });
        return;
      }
      if (config.h5PublicUrl) {
        res.redirect(h5AuthReturnUrl(result.token, parsed.returnTo));
        return;
      }
      res.type("html").send(
        `<!doctype html><meta charset="utf-8"><title>星卡</title>
         <body style="font-family:sans-serif;padding:24px">已授权，请返回星卡页面。</body>`,
      );
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

  app.post("/me/avatar", requireAuth, async (req, res, next) => {
    try {
      const avatarUrl = await saveUserAvatar(req.user!.id, req.body?.imageBase64, req.body?.mimeType);
      res.json({ avatarUrl });
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
  app.get("/catalog/channels", async (_req, res, next) => {
    try {
      const dict = await loadRuntimeChannelDictionary();
      res.json({
        channels: dict.channels.map((c) => ({
          code: c.code,
          nameZh: c.name_zh,
          aliases: c.aliases,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/benefits", async (req, res, next) => {
    try {
      const rows = await listLibraryBenefits({
        groupId: typeof req.query.groupId === "string" ? req.query.groupId : "",
        releaseId: typeof req.query.releaseId === "string" ? req.query.releaseId : "",
      });
      res.json({ rows });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups", async (req, res, next) => {
    try {
      const ugcOpen = req.query.ugc_open === "1" || req.query.ugc_open === "true";
      res.json({ groups: await catalog.listGroups(ugcOpen ? { ugcOpen: true } : undefined) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id, { requirePublished: true });
      const members = await catalog.listMembers(group.id as string);
      const releases = await catalog.listReleases(group.id as string);
      res.json({ group, members, releases });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id/members", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id, { requirePublished: true });
      res.json({ members: await catalog.listMembers(group.id as string) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/groups/:id/releases", async (req, res, next) => {
    try {
      const group = await catalog.getGroup(req.params.id, { requirePublished: true });
      res.json({ releases: await catalog.listReleases(group.id as string) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/releases/:id/templates", async (req, res, next) => {
    try {
      await catalog.getRelease(req.params.id, { requirePublished: true });
      const templates = await catalog.searchTemplates({ releaseId: req.params.id });
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/releases/:id", async (req, res, next) => {
    try {
      const release = await catalog.getRelease(req.params.id, { requirePublished: true });
      res.json({ release });
    } catch (e) {
      next(e);
    }
  });

  app.get("/catalog/templates/:id", async (req, res, next) => {
    try {
      res.json({ template: await catalog.getPublicTemplate(req.params.id) });
    } catch (e) {
      next(e);
    }
  });

  // 刀 B：游客可读版本×confirmed 特典矩阵；无 confirmed 返回 empty，不改 completeness 主路径
  app.get("/catalog/releases/:id/benefit-matrix", async (req, res, next) => {
    try {
      res.json(await getReleaseBenefitMatrix(req.params.id));
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

  app.get("/catalog/channels", async (_req, res, next) => {
    try {
      res.json(await loadRuntimeChannelDictionary());
    } catch (e) {
      next(e);
    }
  });

  app.post("/catalog/templates/:id/report", requireAuth, async (req, res, next) => {
    try {
      res.json(
        await catalogSubmissions.reportTemplate(req.user!.id, req.params.id, req.body?.text || req.body?.reason),
      );
    } catch (e) {
      next(e);
    }
  });

  app.post("/media/ugc-pending", requireAuth, async (req, res, next) => {
    try {
      res.json(await catalogSubmissions.uploadPendingMedia(req.user!.id, req.body || {}));
    } catch (e) {
      next(e);
    }
  });

  app.post("/catalog/submissions", requireAuth, async (req, res, next) => {
    try {
      res.json(await catalogSubmissions.createSubmission(req.user!.id, req.body || {}, req.user!.wxOpenid));
    } catch (e) {
      next(e);
    }
  });

  app.post("/catalog/grid/split", requireAuth, async (req, res, next) => {
    try {
      res.json(await gridSplit.splitPhotocardGrid(req.body || {}));
    } catch (e) {
      next(e);
    }
  });

  app.get("/me/catalog-submissions", requireAuth, async (req, res, next) => {
    try {
      res.json({ submissions: await catalogSubmissions.listMine(req.user!.id) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/me/catalog-submissions/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await catalogSubmissions.getSubmissionForUser(req.user!.id, req.params.id));
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

  app.post("/collection/custom-cards/:id/apply-catalog", requireAuth, async (req, res, next) => {
    try {
      res.json(
        await catalogSubmissions.applyFromCustomCard(
          req.user!.id,
          req.params.id,
          req.body || {},
          req.user!.wxOpenid,
        ),
      );
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

  app.get("/h5/bootstrap", async (req, res, next) => {
    try {
      const rawPath = String(req.query.path || "pages/catalog/index");
      const qIndex = rawPath.indexOf("?");
      const page = (qIndex >= 0 ? rawPath.slice(0, qIndex) : rawPath) || "pages/catalog/index";
      const query = qIndex >= 0 ? rawPath.slice(qIndex + 1) : "";
      const jump = await resolveMiniJump({ page, query });
      res.json({
        webOAuth: Boolean(config.wxWebAppId) || mockWxWebLoginEnabled,
        mockAuth: mockWxWebLoginEnabled,
        mini: {
          appId: jump.appId,
          ghId: jump.ghId,
          urlScheme: jump.urlScheme,
          urlLink: jump.urlLink,
        },
        cta: {
          ...shareCta(),
          urlScheme: jump.urlScheme,
          urlLink: jump.urlLink,
          ghId: jump.ghId,
          appId: jump.appId,
          canJump: jump.canJump,
          missing: jump.missing,
        },
        jsSdk: jump.jsSdk,
        canJump: jump.canJump,
        missing: jump.missing,
        reason: jump.reason,
        publicBaseUrl: config.publicBaseUrl,
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/h5/jssdk-config", async (req, res, next) => {
    try {
      const url = String(req.query.url || "");
      if (!url) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "缺少 url" } });
        return;
      }
      res.json(await jsSdkSignature(url));
    } catch (e) {
      next(e);
    }
  });

  app.get("/share/summary", async (req, res, next) => {
    try {
      res.json(
        await getShareSummary({
          g: req.query.g as string | undefined,
          r: req.query.r as string | undefined,
          t: req.query.t as string | undefined,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/share/landing", async (req, res, next) => {
    try {
      const input = {
        g: req.query.g as string | undefined,
        r: req.query.r as string | undefined,
        t: req.query.t as string | undefined,
      };
      if (!input.g && !input.r && !input.t) {
        input.g = "";
      }
      const wantsJson = req.query.format === "json" || String(req.headers.accept || "").includes("application/json");
      if (wantsJson && (input.g || input.r || input.t)) {
        res.json(await getShareSummary(input));
        return;
      }
      const h5Url = req.query.noredirect ? null : h5LandingUrl(input);
      if (h5Url && (input.g || input.r || input.t)) {
        res.redirect(h5Url);
        return;
      }
      if (!input.g && !input.r && !input.t) {
        res.type("html").send(renderShareLandingHtml({
          kind: "group",
          group: {
            id: "",
            slug: "",
            nameZh: "星卡",
            nameEn: "Xingka",
            logoColor: "#6B5CFF",
            iconUrl: null,
            logoUrl: null,
            scopeNote: null,
            publishedReleaseCount: 0,
            publishedTemplateCount: 0,
            releases: [],
          },
          mini: { path: "pages/catalog/index", query: "", page: "pages/catalog/index" },
          cta: shareCta(),
        }));
        return;
      }
      const summary = await getShareSummary(input);
      const catalogUrl = h5LandingUrl(input);
      res.type("html").send(renderShareLandingHtml(summary, { catalogUrl }));
    } catch (e) {
      if (e instanceof AppError && e.status === 404 && req.query.format !== "json") {
        res.status(404).type("html").send(
          `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
           <title>星卡</title><body style="font-family:sans-serif;padding:24px;background:#F4F5F9">
           <p>未找到已发布内容。请使用微信打开星卡小程序。</p></body>`,
        );
        return;
      }
      next(e);
    }
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

  app.get("/admin/tickets", requireAdmin, async (req, res, next) => {
    try {
      res.json(
        await tickets.listTickets({
          status: req.query.status as string | undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/tickets/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await tickets.getTicket(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/tickets/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await tickets.updateTicket(
        req.params.id,
        {
          status: req.body?.status,
          assigneeOpsId: req.body?.assigneeOpsId,
          internalNote: req.body?.internalNote,
        },
        req.ops,
      );
      await writeAuditLog({
        actor: req.ops,
        action: "ticket.update",
        entityType: "missing_feedback",
        entityId: result.id,
        payload: {
          status: result.status,
          assigneeOpsId: result.assignee?.id,
          closed: !!result.closedAt,
        },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/tickets/:id/templates", requireAdmin, async (req, res, next) => {
    try {
      const templateId = req.body?.templateId ? String(req.body.templateId) : "";
      if (templateId) {
        const result = await tickets.linkTicketTemplate(req.params.id, templateId);
        await writeAuditLog({
          actor: req.ops,
          action: "ticket.link_template",
          entityType: "missing_feedback",
          entityId: result.id,
          payload: { templateId, templateStatus: result.linkedTemplate?.status },
        });
        res.json(result);
        return;
      }
      const created = await tickets.createDraftAndLink(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "ticket.create_template",
        entityType: "missing_feedback",
        entityId: created.ticket.id,
        payload: {
          templateId: created.template.id,
          status: created.template.status,
          version: req.body?.version,
        },
      });
      res.json(created);
    } catch (e) {
      next(e);
    }
  });

  // ---- admin ----
  app.post("/admin/import/validate", requireAdmin, async (req, res, next) => {
    try {
      const result = await previewOrCommitImport({ ...(req.body || {}), dryRun: true });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/import", requireAdmin, async (req, res, next) => {
    try {
      const result = await previewOrCommitImport(req.body);
      if (result.committed) {
        await writeAuditLog({
          actor: req.ops,
          action: "catalog.import",
          entityType: "release",
          entityId: result.releaseId,
          payload: {
            groupSlug: req.body?.groupSlug,
            format: result.report.format,
            count: result.count,
            batches: result.report.batches.map((b) => b.releaseTitle),
          },
        });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // ---- version × benefit map (刀 A; does not touch catalog import / completeness) ----
  app.get("/admin/version-benefit/channels", requireAdmin, async (_req, res, next) => {
    try {
      res.json(await loadRuntimeChannelDictionary({ includeDisabled: true }));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/channels", requireAdmin, async (req, res, next) => {
    try {
      const channel = await createChannelEntry(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "channel.create",
        entityType: "channel_dictionary",
        entityId: channel.code,
        payload: { code: channel.code },
      });
      res.json(channel);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/version-benefit/channels/:code", requireAdmin, async (req, res, next) => {
    try {
      const channel = await updateChannelEntry(req.params.code, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "channel.update",
        entityType: "channel_dictionary",
        entityId: channel.code,
        payload: { enabled: channel.enabled },
      });
      res.json(channel);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/channels/:code/disable", requireAdmin, async (req, res, next) => {
    try {
      const channel = await disableChannelEntry(req.params.code);
      await writeAuditLog({
        actor: req.ops,
        action: "channel.disable",
        entityType: "channel_dictionary",
        entityId: channel.code,
        payload: { enabled: false },
      });
      res.json(channel);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/version-benefit/maps", requireAdmin, async (req, res, next) => {
    try {
      const releaseId = req.query.releaseId ? String(req.query.releaseId) : "";
      const groupId = req.query.groupId ? String(req.query.groupId) : "";
      res.json({
        maps: await listBenefitMaps({
          releaseId: releaseId || undefined,
          groupId: groupId || undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/validate", requireAdmin, async (req, res, next) => {
    try {
      const result = await previewOrCommitBenefitMap({
        text: req.body?.text,
        tagsStrict: !!req.body?.tagsStrict,
        commit: false,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/import", requireAdmin, async (req, res, next) => {
    try {
      const result = await previewOrCommitBenefitMap({
        text: req.body?.text,
        tagsStrict: !!req.body?.tagsStrict,
        commit: true,
        importedBy: req.ops?.username || null,
      });
      if (result.written > 0) {
        await writeAuditLog({
          actor: req.ops,
          action: "version_benefit.import",
          entityType: "release_benefit_map",
          entityId: result.maps?.[0]?.releaseId,
          payload: {
            written: result.written,
            errorCount: result.report.errorCount,
            rowCount: result.report.rowCount,
          },
        });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/maps", requireAdmin, async (req, res, next) => {
    try {
      const result = await upsertBenefitMapRow(req.body || {}, req.ops?.username || null);
      await writeAuditLog({
        actor: req.ops,
        action: "version_benefit.map.create",
        entityType: "release_benefit_map",
        entityId: result.map.id,
        payload: { status: result.map.status, channelCode: result.map.channelCode },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/version-benefit/maps/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await upsertBenefitMapRow(req.body || {}, req.ops?.username || null, {
        id: req.params.id,
      });
      await writeAuditLog({
        actor: req.ops,
        action: "version_benefit.map.update",
        entityType: "release_benefit_map",
        entityId: result.map.id,
        payload: { status: result.map.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/version-benefit/maps/:id/retire", requireAdmin, async (req, res, next) => {
    try {
      const result = await retireBenefitMapRow(req.params.id, req.ops?.username || null);
      await writeAuditLog({
        actor: req.ops,
        action: "version_benefit.map.retire",
        entityType: "release_benefit_map",
        entityId: result.map.id,
        payload: { status: result.map.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/version-benefit/maps/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await deleteBenefitMapRow(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "version_benefit.map.delete",
        entityType: "release_benefit_map",
        entityId: result.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/media/:kind", requireAdmin, async (req, res, next) => {
    try {
      const kind = String(req.params.kind || "");
      if (!isPublicMediaKind(kind)) throw new AppError(400, "BAD_REQUEST", "kind 必须是 cards 或 logos");
      const saved = await savePublicCatalogImage({
        kind,
        base64: req.body?.imageBase64 || req.body?.base64,
        mimeType: req.body?.mimeType,
        fileStem: req.body?.fileStem ? String(req.body.fileStem) : undefined,
      });
      await writeAuditLog({
        actor: req.ops,
        action: `media.${kind}.upload`,
        entityType: kind === "logos" ? "idol_group" : "template",
        entityId: saved.fileName,
        payload: { path: saved.publicPath },
      });
      res.json({ path: saved.publicPath, contentType: saved.contentType });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/completeness", requireAdmin, async (_req, res, next) => {
    try {
      res.json(await getCompletenessDashboard());
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
        groupId: req.query.groupId as string | undefined,
        releaseId: req.query.releaseId as string | undefined,
        memberId: req.query.memberId as string | undefined,
        status: req.query.status as string | undefined,
        includeDraft: true,
      });
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.getTemplate(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.updateTemplate(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "template.update",
        entityType: "template",
        entityId: result.id,
        payload: { version: req.body?.version, releaseId: req.body?.releaseId },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/deprecate", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.setTemplateStatus(req.params.id, "deprecated");
      await writeAuditLog({
        actor: req.ops,
        action: "template.deprecate",
        entityType: "template",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/templates/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.setTemplateStatus(req.params.id, req.body?.status);
      await writeAuditLog({
        actor: req.ops,
        action: `template.${result.status}`,
        entityType: "template",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.deleteTemplate(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "template.delete",
        entityType: "template",
        entityId: result.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog-submissions", requireAdmin, async (req, res, next) => {
    try {
      res.json({
        submissions: await catalogSubmissions.adminList({
          status: req.query.status as string | undefined,
          groupId: req.query.groupId as string | undefined,
          releaseId: req.query.releaseId as string | undefined,
          userId: req.query.userId as string | undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog-submissions/:id/media/:side", requireAdmin, async (req, res, next) => {
    try {
      const publicPath = await catalogSubmissions.adminMediaPath(req.params.id, String(req.params.side || ""));
      if (!publicPath) {
        res.status(404).end();
        return;
      }
      const img = await readStoredImage(publicPath);
      if (!img) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.type(img.contentType).send(img.body);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog-submissions/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await catalogSubmissions.adminGet(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog-submissions/:id/approve", requireAdmin, async (req, res, next) => {
    try {
      const result = await catalogSubmissions.approveSubmission(
        req.params.id,
        req.body || {},
        req.ops?.username || "ops",
      );
      await writeAuditLog({
        actor: req.ops,
        action: "catalog_submission.approve",
        entityType: "catalog_submission",
        entityId: req.params.id,
        payload: {
          resultTemplateId: result.resultTemplateId,
          adopt: !!req.body?.adoptSubmissionImage,
          pointsAwarded: result.pointsAwarded,
        },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog-submissions/:id/reject", requireAdmin, async (req, res, next) => {
    try {
      const result = await catalogSubmissions.rejectSubmission(
        req.params.id,
        req.body?.reason,
        req.ops?.username || "ops",
      );
      await writeAuditLog({
        actor: req.ops,
        action: "catalog_submission.reject",
        entityType: "catalog_submission",
        entityId: req.params.id,
        payload: { reason: req.body?.reason },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/users", requireAdmin, async (req, res, next) => {
    try {
      res.json(
        await adminUsers.listAdminUsers({
          q: req.query.q as string | undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/users/:id/submissions", requireAdmin, async (req, res, next) => {
    try {
      res.json({ submissions: await adminUsers.listAdminUserSubmissions(req.params.id) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/users/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await adminUsers.getAdminUser(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  // ---- admin catalog CRUD (OPS-1) ----
  app.get("/admin/catalog/groups", requireAdmin, async (_req, res, next) => {
    try {
      res.json({ groups: await adminCatalog.listAdminGroups() });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/groups", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.createGroup(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "group.create",
        entityType: "idol_group",
        entityId: result.id,
        payload: { slug: result.slug, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/groups/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await adminCatalog.getAdminGroup(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/catalog/groups/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.updateGroup(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "group.update",
        entityType: "idol_group",
        entityId: result.id,
        payload: { slug: result.slug },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/groups/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.setGroupStatus(req.params.id, req.body?.status);
      await writeAuditLog({
        actor: req.ops,
        action: `group.${result.status}`,
        entityType: "idol_group",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/catalog/groups/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.deleteGroup(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "group.delete",
        entityType: "idol_group",
        entityId: result.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/members", requireAdmin, async (req, res, next) => {
    try {
      res.json({ members: await adminCatalog.listAdminMembers(req.query.groupId as string | undefined) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/members", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.createMember(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "member.create",
        entityType: "member",
        entityId: result.id,
        payload: { groupId: result.groupId, nameEn: result.nameEn, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/members/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await adminCatalog.getAdminMember(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/catalog/members/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.updateMember(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "member.update",
        entityType: "member",
        entityId: result.id,
        payload: { nameEn: result.nameEn },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/members/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.setMemberStatus(req.params.id, req.body?.status);
      await writeAuditLog({
        actor: req.ops,
        action: `member.${result.status}`,
        entityType: "member",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/catalog/members/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.deleteMember(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "member.delete",
        entityType: "member",
        entityId: result.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/releases", requireAdmin, async (req, res, next) => {
    try {
      res.json({ releases: await adminCatalog.listAdminReleases(req.query.groupId as string | undefined) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/releases", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.createRelease(req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "release.create",
        entityType: "release",
        entityId: result.id,
        payload: { title: result.title, kind: result.kind, status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/releases/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await adminCatalog.getAdminRelease(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/catalog/releases/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.updateRelease(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "release.update",
        entityType: "release",
        entityId: result.id,
        payload: { title: result.title, kind: result.kind },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/releases/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.setReleaseStatus(req.params.id, req.body?.status);
      await writeAuditLog({
        actor: req.ops,
        action: `release.${result.status}`,
        entityType: "release",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/catalog/releases/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await adminCatalog.deleteRelease(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "release.delete",
        entityType: "release",
        entityId: result.id,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/templates", requireAdmin, async (req, res, next) => {
    try {
      const templates = await catalog.searchTemplates({
        q: req.query.q as string | undefined,
        groupId: req.query.groupId as string | undefined,
        releaseId: req.query.releaseId as string | undefined,
        memberId: req.query.memberId as string | undefined,
        status: req.query.status as string | undefined,
        includeDraft: true,
      });
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/templates", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.createDraftTemplate(req.body || {});
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

  app.post("/admin/catalog/templates/hard-delete", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.hardDeleteTemplates(req.body?.ids);
      for (const id of result.deleted) {
        await writeAuditLog({
          actor: req.ops,
          action: "template.delete",
          entityType: "template",
          entityId: id,
        });
      }
      await writeAuditLog({
        actor: req.ops,
        action: "template.hard_delete",
        entityType: "template",
        entityId: result.deleted[0] || null,
        payload: { deleted: result.deleted, failed: result.failed },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.get("/admin/catalog/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      res.json(await admin.getTemplate(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  app.patch("/admin/catalog/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.updateTemplate(req.params.id, req.body || {});
      await writeAuditLog({
        actor: req.ops,
        action: "template.update",
        entityType: "template",
        entityId: result.id,
        payload: { version: req.body?.version, releaseId: req.body?.releaseId },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post("/admin/catalog/templates/:id/status", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.setTemplateStatus(req.params.id, req.body?.status);
      await writeAuditLog({
        actor: req.ops,
        action: `template.${result.status}`,
        entityType: "template",
        entityId: result.id,
        payload: { status: result.status },
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete("/admin/catalog/templates/:id", requireAdmin, async (req, res, next) => {
    try {
      const result = await admin.deleteTemplate(req.params.id);
      await writeAuditLog({
        actor: req.ops,
        action: "template.delete",
        entityType: "template",
        entityId: result.id,
      });
      res.json(result);
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
  app.get("/media/cards/:file", async (req, res, next) => {
    try {
      const file = path.basename(req.params.file);
      if (!isSafeCardsMediaFile(file)) {
        res.status(404).end();
        return;
      }
      const img = await readStoredImage(`/media/cards/${file}`);
      if (!img) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.type(img.contentType).send(img.body);
    } catch (e) {
      next(e);
    }
  });
  app.get("/media/logos/:file", async (req, res, next) => {
    try {
      const file = path.basename(req.params.file);
      if (!isSafeCardsMediaFile(file)) {
        res.status(404).end();
        return;
      }
      const img = await readStoredImage(`/media/logos/${file}`);
      if (!img) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.type(img.contentType).send(img.body);
    } catch (e) {
      next(e);
    }
  });
  app.get("/media/ugc-pending/:userId/:file", async (req, res, next) => {
    try {
      const { userId, file } = req.params;
      if (!isSafePendingMediaParams(userId, file)) {
        res.status(404).end();
        return;
      }
      const publicPath = `/media/ugc-pending/${userId}/${file}`;
      const img = await readStoredImage(publicPath);
      if (!img) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.type(img.contentType).send(img.body);
    } catch (e) {
      next(e);
    }
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
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
