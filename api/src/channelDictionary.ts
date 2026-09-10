import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ChannelDef = {
  code: string;
  name_zh: string;
  aliases: string[];
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
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
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
