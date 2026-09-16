import type { GridBox } from "../gridDetectCore.js";

/** Normalized [x1, y1, x2, y2] in 0–1 relative to the full image. */
export type VlmBBox = [number, number, number, number];

export type VlmCard = {
  bbox: VlmBBox;
  confidence?: number;
  memberName?: string;
  versionLabel?: string;
};

export type VlmDetectInput = {
  mimeType: string;
  buffer: Buffer;
  signal?: AbortSignal;
};

export type VlmDetectResult = {
  cards: VlmCard[];
  /** 发给模型的文本提示词（不含图片）。 */
  promptText?: string;
  /** 模型返回原文（content/text，不含图片 multipart）。 */
  rawText?: string;
};

/** 挂在 detect 异常上，失败写审计时尽量带上 prompt / raw。 */
export type VlmDetectLog = {
  promptText?: string;
  rawText?: string;
};

export function attachVlmDetectLog<T extends Error>(err: T, log: VlmDetectLog): T {
  const e = err as T & VlmDetectLog;
  if (log.promptText) e.promptText = log.promptText;
  if (log.rawText) e.rawText = log.rawText;
  return e;
}

export function readVlmDetectLog(err: unknown): VlmDetectLog {
  if (!err || typeof err !== "object") return {};
  const o = err as VlmDetectLog;
  return {
    promptText: typeof o.promptText === "string" ? o.promptText : undefined,
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
  };
}

export type GridVlmProvider = {
  readonly id: string;
  detect(input: VlmDetectInput): Promise<VlmDetectResult>;
};

export type DetectedGridCard = GridBox & {
  confidence?: number;
  memberName?: string;
  versionLabel?: string;
};

export type GridEngine = "vlm" | "jsfeat";
