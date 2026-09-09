import { query } from "./db.js";

export type AuditActor = {
  id?: string | null;
  username: string;
  role: string;
};

export type AuditEntry = {
  actor?: AuditActor | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null | unknown;
  payload?: unknown;
};

const MAX_PAYLOAD_BYTES = 8_192;

function sanitizePayload(payload: unknown): unknown {
  if (payload == null) return {};
  if (typeof payload !== "object") return { value: String(payload).slice(0, 500) };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (/pass/i.test(key) || /secret/i.test(key) || /token/i.test(key)) continue;
    if (value == null) continue;
    if (typeof value === "string") out[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20);
    else out[key] = value;
  }
  const json = JSON.stringify(out);
  if (json.length <= MAX_PAYLOAD_BYTES) return out;
  return { truncated: true, preview: json.slice(0, 400) };
}

/** Persist who / when / what entity changed for privileged admin writes. */
export async function writeAuditLog(entry: AuditEntry) {
  const actor = entry.actor;
  const entityId = entry.entityId == null ? null : String(entry.entityId);
  await query(
    `INSERT INTO admin_audit_logs
       (actor_id, actor_username, actor_role, action, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      actor?.id || null,
      actor?.username || "unknown",
      actor?.role || "ops",
      entry.action,
      entry.entityType || null,
      entityId,
      JSON.stringify(sanitizePayload(entry.payload)),
    ],
  );
}

export type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorUsername: string;
  actorRole: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
};

export async function listAuditLogs(limit = 50): Promise<AuditLogRow[]> {
  const n = Math.min(100, Math.max(1, Number(limit) || 50));
  const r = await query<{
    id: string;
    actor_id: string | null;
    actor_username: string;
    actor_role: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    payload: unknown;
    created_at: Date;
  }>(
    `SELECT id, actor_id, actor_username, actor_role, action, entity_type, entity_id, payload, created_at
     FROM admin_audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [n],
  );
  return r.rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}
