import sharp from "sharp";
import { gridVlmConfig } from "../config.js";
import { cardsFromModelText, completionText } from "./parse.js";
import { attachVlmDetectLog, type GridVlmProvider, type VlmDetectInput, type VlmDetectResult } from "./types.js";

/** 发给豆包视觉的文本提示词（不含图片）。Admin 审计与 detect 共用。 */
export const GRID_VLM_DETECT_PROMPT = `请找出图中每一张偶像小卡（photocard）的矩形位置。可能是规则宫格，也可能不规则散落。请检出所有小卡；服务端可能只保留配置的上限张数。忽略手机、手、专辑封面、便签、桌面杂物。

对每张小卡输出 Grounding 框，坐标为相对整图的 0–1000（左 上 右 下），必须检出所有小卡，每卡一行：
<bbox>x_min y_min x_max y_max</bbox>

也可以附加 JSON（bbox 用 0–1000 或 0–1 均可；memberName / versionLabel 为可选建议，不确定留空）：
{"cards":[{"bbox":[x1,y1,x2,y2],"memberName":"","versionLabel":""}]}

没有小卡时不要输出 <bbox>，或返回 {"cards":[]}。`;

/** 发给方舟前的长边上限（fit inside）；960 与 zeal-home OCR 同档，兼顾 bbox 精度与体积。 */
export const VLM_MAX_EDGE = 960;
/** JPEG 质量；60 与 zeal-home OCR 同档。 */
export const VLM_JPEG_QUALITY = 60;
/** Grounding 可能返回多行 `<bbox>`；512 易截断，1024 为上限。 */
export const VLM_MAX_TOKENS = 1024;

function vlmErr(name: string, message: string, rawText?: string) {
  const err = new Error(message);
  err.name = name;
  return attachVlmDetectLog(err, { promptText: GRID_VLM_DETECT_PROMPT, rawText });
}

function logDetectTiming(parts: {
  model: string;
  encodeMs: number;
  arkMs: number;
  parseMs: number;
  totalMs: number;
  jpegBytes?: number;
}) {
  const jpeg = parts.jpegBytes != null ? ` jpegBytes=${parts.jpegBytes}` : "";
  console.log(
    `[grid-vlm] detect model=${parts.model} encodeMs=${parts.encodeMs} arkMs=${parts.arkMs} parseMs=${parts.parseMs} totalMs=${parts.totalMs}${jpeg}`,
  );
}

export class DoubaoVisionProvider implements GridVlmProvider {
  readonly id = "doubao";

  async detect(input: VlmDetectInput): Promise<VlmDetectResult> {
    const cfg = gridVlmConfig();
    if (!cfg.apiKey) {
      throw vlmErr("VlmUnconfiguredError", "vlm_unconfigured");
    }
    if (!cfg.model) {
      throw vlmErr("VlmUnconfiguredError", "vlm_unconfigured");
    }

    const t0 = Date.now();
    let encodeMs = 0;
    let arkMs = 0;
    let parseMs = 0;
    let jpegBytes = 0;

    try {
      const tEncode = Date.now();
      const jpeg = await sharp(input.buffer)
        .rotate()
        .resize(VLM_MAX_EDGE, VLM_MAX_EDGE, { fit: "inside" })
        .jpeg({ quality: VLM_JPEG_QUALITY })
        .toBuffer();
      encodeMs = Date.now() - tEncode;
      jpegBytes = jpeg.length;
      const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      const url = `${cfg.baseUrl}/chat/completions`;
      const tArk = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.1,
          max_tokens: VLM_MAX_TOKENS,
          reasoning_effort: "minimal",
          thinking: { type: "disabled" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: GRID_VLM_DETECT_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        signal: input.signal,
      });
      const text = await res.text();
      arkMs = Date.now() - tArk;
      if (!res.ok) {
        throw vlmErr("VlmHttpError", `vlm_http_${res.status}`, text);
      }
      const tParse = Date.now();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        parseMs = Date.now() - tParse;
        throw vlmErr("VlmHttpError", "vlm_http_json", text);
      }
      const content = completionText(payload);
      const cards = cardsFromModelText(content);
      parseMs = Date.now() - tParse;
      return {
        cards,
        promptText: GRID_VLM_DETECT_PROMPT,
        rawText: content,
      };
    } finally {
      logDetectTiming({
        model: cfg.model,
        encodeMs,
        arkMs,
        parseMs,
        totalMs: Date.now() - t0,
        jpegBytes,
      });
    }
  }
}
