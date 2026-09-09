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
  dataDir: path.resolve(process.env.DATA_DIR || path.join(here, "../data")),
  wxAppId: process.env.WX_APPID || "",
  wxSecret: process.env.WX_SECRET || "",
  // Railway Bucket（S3 兼容）。未配置时私人卡图落到本地 dataDir/custom
  bucket: process.env.BUCKET || "",
  bucketRegion: process.env.BUCKET_REGION || "sin",
  bucketEndpoint: process.env.BUCKET_ENDPOINT || "",
  bucketAccessKeyId: process.env.BUCKET_ACCESS_KEY_ID || "",
  bucketSecretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY || "",
};

export const isProd = config.nodeEnv === "production";
export const mockWxLoginEnabled = !isProd || !config.wxAppId || !config.wxSecret;
