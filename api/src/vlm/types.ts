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
  rawText?: string;
};

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
