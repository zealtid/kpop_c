import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { originFromPublicUrl, parseCorsOrigins } from "./cors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl:
    process.env.DATABASE_URL || "postgres://kpop:kpop@localhost:5432/kpop_c",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-do-not-use-in-prod",
  nodeEnv: process.env.NODE_ENV || "development",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  adminToken: process.env.ADMIN_TOKEN || "dev-admin",
  /** Username/password admin (OPS-0). Empty in prod unless explicitly set. */
  opsAdminUser: (process.env.OPS_ADMIN_USER || "").trim().toLowerCase(),
  opsAdminPassword: process.env.OPS_ADMIN_PASSWORD || "",
  opsAdminPasswordHash: (process.env.OPS_ADMIN_PASSWORD_HASH || "").trim(),
  /** Comma-separated usernames. Empty → rely on ops_users.allowlisted. */
  opsAllowlist: (process.env.OPS_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Extra CORS origins (comma-separated). localhost and *.up.railway.app are always allowed. */
  corsOrigins: parseCorsOrigins(
    [process.env.CORS_ORIGINS, originFromPublicUrl(process.env.H5_PUBLIC_URL)].filter(Boolean).join(","),
  ),
  /** Public H5 origin (Railway `h5` service). Used to redirect QR `/share/landing` and OAuth return. */
  h5PublicUrl: (process.env.H5_PUBLIC_URL || "").replace(/\/$/, ""),
  /** Official Account / website-app credentials for WeChat web OAuth (H5). Distinct from WX_APPID. */
  wxWebAppId: process.env.WX_WEB_APPID || "",
  wxWebSecret: process.env.WX_WEB_SECRET || "",
  wxWebRedirectUri: process.env.WX_WEB_REDIRECT_URI || "",
  /** Optional static URL Scheme / 原始 ID for「打开小程序」CTA. */
  wxUrlScheme: process.env.WX_URL_SCHEME || "",
  wxMiniGhId: process.env.WX_MINI_GH_ID || "",
  /**
   * Optional A07 constraint: `bts:<uuid>[,<uuid>]`. Read live from env in catalogConstraints
   * so tests can toggle it. Documented here for operators.
   */
  catalogReleaseAllowlist: process.env.CATALOG_RELEASE_ALLOWLIST || "",
  dataDir: path.resolve(process.env.DATA_DIR || path.join(here, "../data")),
  wxAppId: process.env.WX_APPID || "",
  wxSecret: process.env.WX_SECRET || "",
  // Railway Bucket xingka-user-cards（S3 兼容 reference vars）。未配置时私人卡图落到本地 dataDir/custom
  bucket: process.env.S3_BUCKET || "",
  bucketRegion: process.env.S3_REGION || "",
  bucketEndpoint: process.env.S3_ENDPOINT || "",
  bucketAccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
  bucketSecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
};

/** 2026-09-16 拍板：豆包视觉定位 / Grounding。生产也可改填方舟接入点 `ep-…`，勿校验必须是 seed 名。 */
export const DEFAULT_ARK_VISION_MODEL = "doubao-seed-2-0-lite-260215";

/**
 * UGC-2b-VLM: Volcengine Ark / Doubao vision. Read live so tests can toggle env.
 * Railway must set ARK_API_KEY (+ optional ARK_VISION_MODEL) before production detect works.
 */
export function gridVlmConfig() {
  const timeout = Number(process.env.GRID_VLM_TIMEOUT_MS || 60_000);
  const dailyLimit = Number(process.env.GRID_VLM_DAILY_LIMIT || 20);
  // 64 is a technical safety ceiling only, not a marketed product cap.
  const maxDetect = Number(process.env.GRID_VLM_MAX_DETECT || 64);
  const maxSubmit = Number(process.env.GRID_VLM_MAX_SUBMIT || 64);
  return {
    provider: (process.env.GRID_VLM_PROVIDER || "doubao").trim().toLowerCase() || "doubao",
    apiKey: (process.env.ARK_API_KEY || "").trim(),
    /** `ARK_VISION_MODEL` as-is: seed id or console endpoint `ep-…`. */
    model: (process.env.ARK_VISION_MODEL || DEFAULT_ARK_VISION_MODEL).trim(),
    baseUrl: (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000,
    dailyLimit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 20,
    maxDetect: Number.isFinite(maxDetect) && maxDetect > 0 ? maxDetect : 64,
    maxSubmit: Number.isFinite(maxSubmit) && maxSubmit > 0 ? maxSubmit : 64,
  };
}

export const isProd = config.nodeEnv === "production";

function envFlagOn(raw: string | undefined | null) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Decide whether WeChat login / getPhoneNumber may invent local mock identities.
 *
 * Production used to treat a missing WX_SECRET as mock-on
 * (`!isProd || !wxAppId || !wxSecret`). That minted `dev:<js_code>` openids for
 * real-device users while DevTools stayed on `mock:devtools`, and real
 * getPhoneNumber could not talk to WeChat. Missing credentials in production
 * must fail with WX_NOT_CONFIGURED instead of silently mocking.
 *
 * Mock is on only when MOCK_WX_LOGIN=1 (explicit; local/dev only) or when
 * not production and appId/secret are absent.
 */
export function resolveMockWxAuth(opts: {
  nodeEnv: string;
  mockFlag?: string | null;
  appId: string;
  secret: string;
}): boolean {
  if (envFlagOn(opts.mockFlag)) return true;
  if (opts.nodeEnv === "production") return false;
  return !String(opts.appId || "").trim() || !String(opts.secret || "").trim();
}

export const mockWxLoginEnabled = resolveMockWxAuth({
  nodeEnv: config.nodeEnv,
  mockFlag: process.env.MOCK_WX_LOGIN,
  appId: config.wxAppId,
  secret: config.wxSecret,
});
/** H5 网页授权：与小程序同一套开关精神；缺 WX_WEB_* 时仅非生产自动 mock。 */
export const mockWxWebLoginEnabled = resolveMockWxAuth({
  nodeEnv: config.nodeEnv,
  mockFlag: process.env.MOCK_WX_WEB_LOGIN || process.env.MOCK_WX_LOGIN,
  appId: config.wxWebAppId,
  secret: config.wxWebSecret,
});
