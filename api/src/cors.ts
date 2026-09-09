/** Extra origins from CORS_ORIGINS (comma-separated, exact Origin strings). */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isRailwayAppHost(hostname: string): boolean {
  return hostname === "up.railway.app" || hostname.endsWith(".up.railway.app");
}

/**
 * Browser Admin SPA origins we reflect. No Origin (mini-program, curl, tests) is allowed.
 * Default allowlist: localhost / 127.0.0.1 / ::1 (any port) and https://*.up.railway.app.
 * Extra exact origins via CORS_ORIGINS (custom domains).
 */
export function isAllowedCorsOrigin(
  origin: string | undefined | null,
  extraOrigins: readonly string[] = [],
): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (isLocalDevHost(host)) return true;
  if (isRailwayAppHost(host)) return true;
  const extra = extraOrigins.map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin) || extra.includes(url.origin);
}
