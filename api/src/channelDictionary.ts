import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { AppError, badRequest, notFound } from "./errors.js";

export type ChannelDef = {
  code: string;
  name_zh: string;
  aliases: string[];
  enabled?: boolean;
  sortOrder?: number;
};

export type ChannelDictionary = {
  channels: ChannelDef[];
};

const here = path.dirname(fileURLToPath(import.meta.url));
export const CHANNEL_DICTIONARY_PATH = path.resolve(here, "../fixtures/channel_dictionary.json");

let cached: ChannelDictionary | null = null;
let aliasIndex: Map<string, string> | null = null;

function normKey(value: string) {
  return value.trim().toLowerCase();
}

export function parseChannelDictionary(raw: unknown): ChannelDictionary {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as ChannelDictionary).channels)) {
    throw new Error("channel_dictionary 缺少 channels 数组");
  }
  const channels: ChannelDef[] = [];
  for (const item of (raw as ChannelDictionary).channels) {
    if (!item || typeof item !== "object") continue;
    const code = String(item.code || "").trim();
    if (!code) continue;
    const aliases = Array.isArray(item.aliases) ? item.aliases.map((a) => String(a)) : [];
    channels.push({ code, name_zh: String(item.name_zh || code), aliases });
  }
  return { channels };
}

export function buildChannelAliasIndex(dict: ChannelDictionary): Map<string, string> {
  const map = new Map<string, string>();
  for (const ch of dict.channels) {
    map.set(normKey(ch.code), ch.code);
    for (const alias of ch.aliases) {
      const key = normKey(alias);
      if (key) map.set(key, ch.code);
    }
  }
  return map;
}

/** Load the static in-repo dictionary. Tests may pass a path or parsed object. */
export function loadChannelDictionary(filePath = CHANNEL_DICTIONARY_PATH): ChannelDictionary {
  if (filePath === CHANNEL_DICTIONARY_PATH && cached) return cached;
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `channel_dictionary 未找到：${filePath}。生产镜像须 COPY fixtures（含 channel_dictionary.json，含 album-inclusion）到 WORKDIR。`,
      );
    }
    throw err;
  }
  const raw = JSON.parse(text);
  const dict = parseChannelDictionary(raw);
  if (filePath === CHANNEL_DICTIONARY_PATH) {
    cached = dict;
    aliasIndex = buildChannelAliasIndex(dict);
  }
  return dict;
}

export function getChannelAliasIndex(dict?: ChannelDictionary): Map<string, string> {
  if (!dict) {
    if (!aliasIndex) aliasIndex = buildChannelAliasIndex(loadChannelDictionary());
    return aliasIndex;
  }
  return buildChannelAliasIndex(dict);
}

/**
 * Case-insensitive alias fold. Returns canonical channel_code or null if unknown to the dict.
 */
export function normalizeChannelCode(raw: string, dict?: ChannelDictionary): string | null {
  const key = normKey(raw);
  if (!key) return null;
  return getChannelAliasIndex(dict).get(key) || null;
}

export function isUnknownChannel(code: string | null | undefined) {
  return (code || "").trim().toLowerCase() === "unknown";
}

/** Expand a C-end search token with matching enabled-channel code / 中文名 / aliases. */
export function expandChannelSearchTokens(token: string, dict: ChannelDictionary): string[] {
  const key = token.trim().toLowerCase();
  if (key.length < 2) return [];
  const extra: string[] = [];
  for (const ch of dict.channels) {
    if (ch.enabled === false) continue;
    const names = [ch.code, ch.name_zh, ...(ch.aliases || [])].map((n) => String(n || "").trim()).filter(Boolean);
    const hit = names.some((n) => {
      const s = n.toLowerCase();
      return s === key || s.includes(key) || (s.length >= 2 && key.includes(s));
    });
    if (hit) extra.push(...names);
  }
  return extra;
}

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";
}

function mapDbChannel(row: Record<string, unknown>): ChannelDef {
  const aliases = Array.isArray(row.aliases) ? row.aliases.map((a) => String(a)) : [];
  return {
    code: String(row.code),
    name_zh: String(row.name_zh),
    aliases,
    enabled: row.enabled !== false,
    sortOrder: Number(row.sort_order || 0),
  };
}

function slugCode(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((a) => String(a).trim()).filter(Boolean);
  if (raw == null || raw === "") return [];
  return String(raw)
    .split(/[,，]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Prefer DB (seeded from fixtures). Empty table falls back to in-repo JSON. */
export async function loadRuntimeChannelDictionary(opts?: {
  includeDisabled?: boolean;
}): Promise<ChannelDictionary> {
  try {
    const where = opts?.includeDisabled ? "" : "WHERE enabled = true";
    const r = await query(
      `SELECT code, name_zh, aliases, enabled, sort_order
       FROM channel_dictionary ${where}
       ORDER BY sort_order, code`,
    );
    if (r.rowCount) {
      return { channels: r.rows.map(mapDbChannel) };
    }
  } catch {
    // 迁移未落地时回退 JSON，避免校验脚本中断
  }
  const file = loadChannelDictionary();
  return {
    channels: file.channels.map((c) => ({ ...c, enabled: true })),
  };
}

export async function seedChannelDictionaryFromFixture() {
  const dict = loadChannelDictionary();
  for (const [i, ch] of dict.channels.entries()) {
    await query(
      `INSERT INTO channel_dictionary (code, name_zh, aliases, enabled, sort_order)
       VALUES ($1,$2,$3,true,$4)
       ON CONFLICT (code) DO NOTHING`,
      [ch.code, ch.name_zh, ch.aliases, i],
    );
  }
}

export async function createChannelEntry(body: Record<string, unknown>) {
  const code = slugCode(body.code);
  if (!code || !CODE_RE.test(code)) throw badRequest("code 须为小写字母、数字与连字符");
  const nameZh = String(body.name_zh ?? body.nameZh ?? "").trim();
  if (!nameZh) throw badRequest("name_zh 不能为空");
  const aliases = parseAliases(body.aliases);
  const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  try {
    await query(
      `INSERT INTO channel_dictionary (code, name_zh, aliases, enabled, sort_order)
       VALUES ($1,$2,$3,true,$4)`,
      [code, nameZh, aliases, sortOrder],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new AppError(409, "DUPLICATE_CHANNEL", "通路 code 已存在");
    throw err;
  }
  return getChannelEntry(code);
}

export async function getChannelEntry(codeRaw: string) {
  const code = slugCode(codeRaw);
  const r = await query(
    `SELECT code, name_zh, aliases, enabled, sort_order FROM channel_dictionary WHERE code = $1`,
    [code],
  );
  if (!r.rows[0]) throw notFound("通路不存在");
  return mapDbChannel(r.rows[0]);
}

export async function updateChannelEntry(codeRaw: string, body: Record<string, unknown>) {
  const row = await getChannelEntry(codeRaw);
  const nameZh =
    body.name_zh != null || body.nameZh != null
      ? String(body.name_zh ?? body.nameZh ?? "").trim()
      : row.name_zh;
  if (!nameZh) throw badRequest("name_zh 不能为空");
  const aliases = body.aliases !== undefined ? parseAliases(body.aliases) : row.aliases;
  const enabled = body.enabled != null ? !!body.enabled : row.enabled !== false;
  const sortOrder =
    body.sortOrder != null && Number.isInteger(Number(body.sortOrder))
      ? Number(body.sortOrder)
      : (row.sortOrder ?? 0);
  await query(
    `UPDATE channel_dictionary SET
       name_zh = $2, aliases = $3, enabled = $4, sort_order = $5, updated_at = now()
     WHERE code = $1`,
    [row.code, nameZh, aliases, enabled, sortOrder],
  );
  return getChannelEntry(row.code);
}

/** Soft-disable. Maps that already used this code stay; 新校验不再认该通路。 */
export async function disableChannelEntry(codeRaw: string) {
  return updateChannelEntry(codeRaw, { enabled: false });
}
