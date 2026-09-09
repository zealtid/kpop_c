import { query } from "./db.js";
import { badRequest, notFound } from "./errors.js";
import { getGroup, mapGroup } from "./catalog.js";
import { timelineTrustLevels, type TrustLevel } from "./feed.js";
import { DISPLAY_TZ, parseUtc, shanghaiDayUtcRange, shanghaiIso } from "./time.js";

export const SCHEDULE_KINDS = [
  "ticket_sale",
  "live",
  "comeback",
  "fansign",
  "broadcast",
  "other",
] as const;
export const SCHEDULE_STATUSES = ["draft", "published", "hidden"] as const;
export const TRUST_LEVELS = ["L1", "L2", "L3"] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const v = String(value || "");
  if (!(allowed as readonly string[]).includes(v)) {
    throw badRequest(`${field} 必须是 ${allowed.join(" | ")}`);
  }
  return v as T;
}

function parseTime(value: unknown, field: string): Date {
  try {
    return parseUtc(value, field);
  } catch {
    throw badRequest(`${field} 无效（请传 ISO UTC）`);
  }
}

async function resolveGroupId(idOrSlug: unknown): Promise<string> {
  if (!idOrSlug) throw badRequest("groupId 不能为空");
  const g = await getGroup(String(idOrSlug));
  return g.id as string;
}

async function hydrateGroup(groupId: string) {
  const r = await query(
    `SELECT id, slug, name_zh, name_en, name_ko, logo_color, scope_note, is_pilot
     FROM idol_groups WHERE id = $1`,
    [groupId],
  );
  return r.rows[0] ? mapGroup(r.rows[0]) : null;
}

export async function mapSchedule(row: Record<string, unknown>) {
  const startAt = row.start_at as Date;
  const endAt = (row.end_at as Date | null) || null;
  return {
    id: row.id,
    groupId: row.group_id,
    group: await hydrateGroup(row.group_id as string),
    title: row.title,
    startAt,
    endAt,
    startAtShanghai: shanghaiIso(startAt),
    endAtShanghai: shanghaiIso(endAt),
    timezone: DISPLAY_TZ,
    timezoneNote: row.timezone_note,
    kind: row.kind,
    location: row.location,
    sourceUrl: row.source_url,
    trustLevel: row.trust_level,
    status: row.status,
    // reserved; M2-a does not implement 缺卡 jump
    releaseId: row.release_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SCHEDULE_SELECT = `
  SELECT id, group_id, title, start_at, end_at, timezone_note, kind, location,
         source_url, trust_level, status, release_id, created_at, updated_at
  FROM schedule_events
`;

async function loadEvent(id: string) {
  const r = await query(`${SCHEDULE_SELECT} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw notFound("日程不存在");
  return mapSchedule(r.rows[0]);
}

export type ScheduleWriteBody = {
  groupId?: string;
  title?: string;
  startAt?: string;
  endAt?: string | null;
  timezoneNote?: string | null;
  kind?: string;
  location?: string | null;
  sourceUrl?: string | null;
  trustLevel?: string;
  status?: string;
  releaseId?: string | null;
};

export async function createSchedule(body: ScheduleWriteBody) {
  const title = String(body.title || "").trim();
  if (!title) throw badRequest("title 不能为空");
  const groupId = await resolveGroupId(body.groupId);
  const startAt = parseTime(body.startAt, "startAt");
  const endAt =
    body.endAt == null || body.endAt === "" ? null : parseTime(body.endAt, "endAt");
  if (endAt && endAt < startAt) throw badRequest("endAt 不能早于 startAt");
  const kind = body.kind ? oneOf(body.kind, SCHEDULE_KINDS, "kind") : "other";
  const trustLevel = body.trustLevel ? oneOf(body.trustLevel, TRUST_LEVELS, "trustLevel") : "L1";
  const status = body.status ? oneOf(body.status, SCHEDULE_STATUSES, "status") : "published";
  const releaseId = body.releaseId || null;
  if (releaseId) {
    const rel = await query("SELECT id FROM releases WHERE id = $1", [releaseId]);
    if (!rel.rows[0]) throw notFound("发行不存在");
  }

  const r = await query<{ id: string }>(
    `INSERT INTO schedule_events
       (group_id, title, start_at, end_at, timezone_note, kind, location, source_url,
        trust_level, status, release_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      groupId,
      title,
      startAt,
      endAt,
      body.timezoneNote ?? null,
      kind,
      body.location ?? null,
      body.sourceUrl ?? null,
      trustLevel,
      status,
      releaseId,
    ],
  );
  return loadEvent(r.rows[0].id);
}

export async function updateSchedule(id: string, body: ScheduleWriteBody) {
  const existing = await query(`${SCHEDULE_SELECT} WHERE id = $1`, [id]);
  if (!existing.rows[0]) throw notFound("日程不存在");

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    sets.push(sql.replace("?", `$${params.length}`));
  };

  if (body.groupId !== undefined) add("group_id = ?", await resolveGroupId(body.groupId));
  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) throw badRequest("title 不能为空");
    add("title = ?", title);
  }
  if (body.startAt !== undefined) add("start_at = ?", parseTime(body.startAt, "startAt"));
  if (body.endAt !== undefined) {
    add("end_at = ?", body.endAt == null || body.endAt === "" ? null : parseTime(body.endAt, "endAt"));
  }
  if (body.timezoneNote !== undefined) add("timezone_note = ?", body.timezoneNote);
  if (body.kind !== undefined) add("kind = ?", oneOf(body.kind, SCHEDULE_KINDS, "kind"));
  if (body.location !== undefined) add("location = ?", body.location);
  if (body.sourceUrl !== undefined) add("source_url = ?", body.sourceUrl);
  if (body.trustLevel !== undefined) {
    add("trust_level = ?", oneOf(body.trustLevel, TRUST_LEVELS, "trustLevel"));
  }
  if (body.status !== undefined) add("status = ?", oneOf(body.status, SCHEDULE_STATUSES, "status"));
  if (body.releaseId !== undefined) {
    const releaseId = body.releaseId || null;
    if (releaseId) {
      const rel = await query("SELECT id FROM releases WHERE id = $1", [releaseId]);
      if (!rel.rows[0]) throw notFound("发行不存在");
    }
    add("release_id = ?", releaseId);
  }

  params.push(id);
  await query(`UPDATE schedule_events SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  return loadEvent(id);
}

export async function setScheduleStatus(id: string, status: ScheduleStatus) {
  return updateSchedule(id, { status });
}

async function followedGroupIds(userId?: string | null): Promise<string[] | null> {
  if (!userId) return null;
  const r = await query("SELECT group_id FROM user_follows WHERE user_id = $1", [userId]);
  return r.rows.map((x) => x.group_id as string);
}

type ListOpts = {
  userId?: string | null;
  groupId?: string;
  from?: Date;
  to?: Date;
  kind?: string;
  includeHidden?: boolean;
  limit?: number;
};

export async function listSchedule(opts: ListOpts = {}) {
  const trust = opts.includeHidden ? (["L1", "L2", "L3"] as TrustLevel[]) : await timelineTrustLevels(opts.userId);
  const params: unknown[] = [];
  const conds = ["1=1"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace("?", `$${params.length}`));
  };

  if (!opts.includeHidden) {
    conds.push("status = 'published'");
    add("trust_level = ANY(?::text[])", trust);
  } else if (opts.kind) {
    // status filter left to caller
  }

  if (opts.groupId) {
    const gid = await resolveGroupId(opts.groupId);
    add("group_id = ?", gid);
  } else {
    const followed = await followedGroupIds(opts.userId);
    if (followed) {
      if (!followed.length) {
        return {
          events: [] as Awaited<ReturnType<typeof mapSchedule>>[],
          timezone: DISPLAY_TZ,
          trustFilter: trust,
          followedGroupIds: followed,
        };
      }
      add("group_id = ANY(?::uuid[])", followed);
    }
  }

  if (opts.from) add("start_at >= ?", opts.from);
  if (opts.to) add("start_at < ?", opts.to);
  if (opts.kind) add("kind = ?", oneOf(opts.kind, SCHEDULE_KINDS, "kind"));

  const limit = Math.min(200, Math.max(1, opts.limit || 100));
  params.push(limit);
  const r = await query(
    `${SCHEDULE_SELECT}
     WHERE ${conds.join(" AND ")}
     ORDER BY start_at ASC
     LIMIT $${params.length}`,
    params,
  );
  const followed = opts.userId ? await followedGroupIds(opts.userId) : null;
  return {
    events: await Promise.all(r.rows.map(mapSchedule)),
    timezone: DISPLAY_TZ,
    trustFilter: trust,
    followedGroupIds: followed,
  };
}

/** Events overlapping the current (or given) Asia/Shanghai calendar day. */
export async function scheduleToday(userId?: string | null, groupId?: string, at: Date = new Date()) {
  const { start, end, dateShanghai } = shanghaiDayUtcRange(at);
  const trust = await timelineTrustLevels(userId);
  const params: unknown[] = [start, end, trust];
  const conds = [
    "status = 'published'",
    "trust_level = ANY($3::text[])",
    "start_at < $2",
    "(end_at IS NULL AND start_at >= $1 OR end_at IS NOT NULL AND end_at >= $1)",
  ];

  if (groupId) {
    const gid = await resolveGroupId(groupId);
    params.push(gid);
    conds.push(`group_id = $${params.length}`);
  } else if (userId) {
    const followed = await followedGroupIds(userId);
    if (followed && !followed.length) {
      return {
        dateShanghai,
        timezone: DISPLAY_TZ,
        events: [] as Awaited<ReturnType<typeof mapSchedule>>[],
        trustFilter: trust,
        followedGroupIds: followed,
      };
    }
    if (followed) {
      params.push(followed);
      conds.push(`group_id = ANY($${params.length}::uuid[])`);
    }
  }

  const r = await query(
    `${SCHEDULE_SELECT} WHERE ${conds.join(" AND ")} ORDER BY start_at ASC LIMIT 100`,
    params,
  );
  return {
    dateShanghai,
    timezone: DISPLAY_TZ,
    events: await Promise.all(r.rows.map(mapSchedule)),
    trustFilter: trust,
    followedGroupIds: userId ? await followedGroupIds(userId) : null,
  };
}

export async function listAdminSchedule(opts: { status?: string; limit?: number } = {}) {
  const params: unknown[] = [];
  const conds = ["1=1"];
  if (opts.status) {
    params.push(oneOf(opts.status, SCHEDULE_STATUSES, "status"));
    conds.push(`status = $${params.length}`);
  }
  const limit = Math.min(200, Math.max(1, opts.limit || 100));
  params.push(limit);
  const r = await query(
    `${SCHEDULE_SELECT} WHERE ${conds.join(" AND ")} ORDER BY start_at DESC LIMIT $${params.length}`,
    params,
  );
  return Promise.all(r.rows.map(mapSchedule));
}

export async function getPublicSchedule(id: string, userId?: string | null) {
  const event = await loadEvent(id);
  const trust = await timelineTrustLevels(userId);
  if (event.status !== "published" || !trust.includes(event.trustLevel as TrustLevel)) {
    throw notFound("日程不存在");
  }
  return event;
}
