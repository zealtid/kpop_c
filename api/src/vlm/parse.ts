import type { VlmCard } from "./types.js";

/**
 * Pull a JSON object/array out of a VLM chat completion (fences, prose, extra tokens).
 */
export function extractJsonValue(text: string): unknown {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("vlm_empty");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    if (start < 0) throw new Error("vlm_json");
    const slice = body.slice(start);
    const endObj = slice.lastIndexOf("}");
    const endArr = slice.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end <= 0) throw new Error("vlm_json");
    return JSON.parse(slice.slice(0, end + 1));
  }
}

export function completionText(payload: unknown): string {
  const root = payload as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
    }>;
  };
  const msg = root?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  const reasoning = msg?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning;
  return "";
}

const BBOX_TAG =
  /<bbox>\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)\s*<\/bbox>/gi;

/** Doubao Grounding: `<bbox>x_min y_min x_max y_max</bbox>` (often 0–1000). */
export function parseGroundingBboxes(text: string): VlmCard[] {
  const cards: VlmCard[] = [];
  const src = String(text || "");
  const re = new RegExp(BBOX_TAG.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    cards.push({
      bbox: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
    });
  }
  return cards;
}

function jsonCards(parsed: unknown): VlmCard[] {
  if (Array.isArray(parsed)) return parsed as VlmCard[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.cards)) return obj.cards as VlmCard[];
    if (Array.isArray(obj.data)) return obj.data as VlmCard[];
    if (Array.isArray(obj.boxes)) return obj.boxes as VlmCard[];
  }
  return [];
}

/** JSON cards plus Grounding `<bbox>` tags. Numbers may still be 0–1000; normalize later. */
export function cardsFromModelText(text: string): VlmCard[] {
  const tags = parseGroundingBboxes(text);
  let fromJson: VlmCard[] = [];
  try {
    fromJson = jsonCards(extractJsonValue(text));
  } catch {
    fromJson = [];
  }
  if (!fromJson.length) return tags;
  if (!tags.length) return fromJson;
  return fromJson.concat(tags);
}
