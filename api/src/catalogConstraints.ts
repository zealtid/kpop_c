import { AppError } from "./errors.js";

/**
 * Configurable per-group release_id allowlist (A07).
 * Env `CATALOG_RELEASE_ALLOWLIST`: `bts:<uuid>[,<uuid>][;slug:<uuid>…]`
 * A group listed here cannot publish / import releases outside the slice.
 * Groups omitted from the env are unconstrained.
 */
export function parseReleaseAllowlist(raw: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const src = String(raw || "").trim();
  if (!src) return map;
  for (const part of src.split(/[;\n]+/)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.search(/[:=]/);
    if (sep < 0) continue;
    const slug = trimmed.slice(0, sep).trim().toLowerCase();
    const ids = trimmed
      .slice(sep + 1)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (slug) map.set(slug, ids);
  }
  return map;
}

export function catalogReleaseAllowlist(): Map<string, string[]> {
  return parseReleaseAllowlist(process.env.CATALOG_RELEASE_ALLOWLIST || "");
}

export function allowedReleaseIdsFor(groupSlug: string): string[] | null {
  const allow = catalogReleaseAllowlist().get(String(groupSlug || "").toLowerCase());
  return allow ?? null;
}

export function catalogConstraint(message: string, details?: unknown) {
  return new AppError(409, "CATALOG_CONSTRAINT", message, details);
}

export function assertReleasePublishAllowed(groupSlug: string, releaseId: string) {
  const allow = allowedReleaseIdsFor(groupSlug);
  if (!allow) return;
  if (!allow.includes(releaseId)) {
    throw catalogConstraint(`组合 ${groupSlug} 仅允许已配置的 release_id 切片，无法发布该发行`, {
      groupSlug,
      releaseId,
      allowedReleaseIds: allow,
    });
  }
}

export function assertImportReleaseAllowed(opts: {
  groupSlug: string;
  releaseId?: string | null;
  creating: boolean;
}) {
  const allow = allowedReleaseIdsFor(opts.groupSlug);
  if (!allow) return;
  if (opts.creating) {
    throw catalogConstraint(`组合 ${opts.groupSlug} 仅允许已配置的发行切片，禁止通过导入扩展新专辑`, {
      groupSlug: opts.groupSlug,
      allowedReleaseIds: allow,
    });
  }
  if (opts.releaseId && !allow.includes(opts.releaseId)) {
    throw catalogConstraint(`组合 ${opts.groupSlug} 仅允许已配置的 release_id 切片，无法导入该发行`, {
      groupSlug: opts.groupSlug,
      releaseId: opts.releaseId,
      allowedReleaseIds: allow,
    });
  }
}
