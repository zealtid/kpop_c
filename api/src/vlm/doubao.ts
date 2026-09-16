import sharp from "sharp";
import { gridVlmConfig } from "../config.js";
import { completionText, extractJsonValue } from "./parse.js";
import type { GridVlmProvider, VlmCard, VlmDetectInput, VlmDetectResult } from "./types.js";

const DETECT_PROMPT = `你是小卡（photocard）检测器。图中可能有规则宫格或不规则散落的偶像小卡。
只返回 JSON，不要 markdown、不要解释。
格式：
{"cards":[{"bbox":[x1,y1,x2,y2],"confidence":0.0,"memberName":"","versionLabel":""}]}
规则：
- bbox 为相对整图的归一化坐标 0–1：左、上、右、下。
- 每张实体小卡一个框；最多 12 张。忽略手机、手、专辑封面、便签、桌面杂物。
- memberName / versionLabel 是可选建议（成员名、特典/版本），不确定则留空字符串。
- 没有小卡时返回 {"cards":[]}。`;

const VLM_MAX_EDGE = 1280;

export class DoubaoVisionProvider implements GridVlmProvider {
  readonly id = "doubao";

  async detect(input: VlmDetectInput): Promise<VlmDetectResult> {
    const cfg = gridVlmConfig();
    if (!cfg.apiKey) {
      const err = new Error("vlm_unconfigured");
      err.name = "VlmUnconfiguredError";
      throw err;
    }
    if (!cfg.model) {
      const err = new Error("vlm_unconfigured");
      err.name = "VlmUnconfiguredError";
      throw err;
    }
    const jpeg = await sharp(input.buffer)
      .rotate()
      .resize(VLM_MAX_EDGE, VLM_MAX_EDGE, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const url = `${cfg.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: DETECT_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: input.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`vlm_http_${res.status}`);
      err.name = "VlmHttpError";
      throw err;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      const err = new Error("vlm_http_json");
      err.name = "VlmHttpError";
      throw err;
    }
    const content = completionText(payload);
    const parsed = extractJsonValue(content);
    const cards = Array.isArray((parsed as { cards?: VlmCard[] })?.cards)
      ? ((parsed as { cards: VlmCard[] }).cards as VlmCard[])
      : Array.isArray(parsed)
        ? (parsed as VlmCard[])
        : [];
    return { cards, rawText: content };
  }
}
