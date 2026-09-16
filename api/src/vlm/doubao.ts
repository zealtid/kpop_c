import sharp from "sharp";
import { gridVlmConfig } from "../config.js";
import { cardsFromModelText, completionText } from "./parse.js";
import type { GridVlmProvider, VlmDetectInput, VlmDetectResult } from "./types.js";

const DETECT_PROMPT = `请找出图中每一张偶像小卡（photocard）的矩形位置。可能是规则宫格，也可能不规则散落。最多 16 张。忽略手机、手、专辑封面、便签、桌面杂物。

对每张小卡输出 Grounding 框，坐标为相对整图的 0–1000（左 上 右 下），必须检出所有小卡，每卡一行：
<bbox>x_min y_min x_max y_max</bbox>

也可以附加 JSON（bbox 用 0–1000 或 0–1 均可；memberName / versionLabel 为可选建议，不确定留空）：
{"cards":[{"bbox":[x1,y1,x2,y2],"memberName":"","versionLabel":""}]}

没有小卡时不要输出 <bbox>，或返回 {"cards":[]}。`;

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
        max_tokens: 2048,
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
    return { cards: cardsFromModelText(content), rawText: content };
  }
}
