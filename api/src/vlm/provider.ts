import { gridVlmConfig } from "../config.js";
import { DoubaoVisionProvider } from "./doubao.js";
import type { GridVlmProvider, VlmDetectInput, VlmDetectResult } from "./types.js";

class UnconfiguredProvider implements GridVlmProvider {
  readonly id = "unconfigured";
  async detect(): Promise<VlmDetectResult> {
    const err = new Error("vlm_unconfigured");
    err.name = "VlmUnconfiguredError";
    throw err;
  }
}

/** Test double: set via setGridVlmProviderForTests. */
export class MockGridVlmProvider implements GridVlmProvider {
  readonly id = "mock";
  constructor(private readonly impl: (input: VlmDetectInput) => Promise<VlmDetectResult> | VlmDetectResult) {}
  async detect(input: VlmDetectInput): Promise<VlmDetectResult> {
    return this.impl(input);
  }
}

let override: GridVlmProvider | null = null;

export function setGridVlmProviderForTests(provider: GridVlmProvider | null) {
  override = provider;
}

export function createGridVlmProvider(): GridVlmProvider {
  if (override) return override;
  const cfg = gridVlmConfig();
  if (cfg.provider === "mock") {
    return new MockGridVlmProvider(async () => ({ cards: [] }));
  }
  if (cfg.provider === "doubao" || cfg.provider === "ark" || !cfg.provider) {
    if (!cfg.apiKey) return new UnconfiguredProvider();
    return new DoubaoVisionProvider();
  }
  return new UnconfiguredProvider();
}
