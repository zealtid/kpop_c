import { createHash } from "node:crypto";

/** Deterministic UUID v5-style id from a stable seed name. */
export function sid(name: string): string {
  const h = createHash("sha1").update(`kpop_c:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const GROUP_H2H = sid("group:h2h");
export const GROUP_BTS = sid("group:bts");
