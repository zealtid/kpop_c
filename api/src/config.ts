import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const isProd = config.nodeEnv === "production";
export const mockWxLoginEnabled = !isProd || !config.wxAppId || !config.wxSecret;
