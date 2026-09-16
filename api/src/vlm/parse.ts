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
