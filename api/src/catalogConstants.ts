export const RELEASE_KINDS = ["album", "single", "mini", "concert_md"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

export function isReleaseKind(value: unknown): value is ReleaseKind {
  return (RELEASE_KINDS as readonly string[]).includes(String(value || "").trim());
}

export function normalizeReleaseKind(value: unknown, fallback: ReleaseKind = "album"): ReleaseKind | null {
  if (value == null || String(value).trim() === "") return fallback;
  const v = String(value).trim();
  return isReleaseKind(v) ? v : null;
}
