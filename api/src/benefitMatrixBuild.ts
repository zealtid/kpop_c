import type { ChannelDictionary } from "./channelDictionary.js";
import { splitSlotLabels } from "./versionBenefitParse.js";
import { templateMatchesSlot, type CatalogTemplate } from "./versionBenefitValidate.js";

export const BENEFIT_MATRIX_INCOMPLETE_COPY = "特典信息来自运营对照表，可能不完整";
export const BENEFIT_MATRIX_READY_COPY = "已凑齐全部特典";
export const DEFAULT_VERSION_BUCKET = "standard";

export type TemplateStatus = "published" | "draft" | "missing";

export type BenefitMatrixSlot = {
  label: string;
  version: string;
  templateId: string | null;
  templateName: string | null;
  templateStatus: TemplateStatus;
  navigable: boolean;
  /** Real catalog image only when published. Never invent a placeholder. */
  imageUrl: string | null;
};

export type BenefitMatrixRow = {
  id: string;
  versionLabel: string;
  benefitNameZh: string;
  channelCode: string;
  channelNameZh: string;
  benefitBatch: string | null;
  mapMode: string;
  slots: BenefitMatrixSlot[];
};

export type BenefitMatrixCompleteness = {
  ready: boolean;
  ratio: number;
  copy: string;
};

export type BenefitMatrix = {
  release: {
    id: string;
    groupId: string;
    title: string;
    titleZh: string | null;
    releasedOn: string | null;
    kind: string;
    groupSlug?: string;
    groupNameZh?: string;
  };
  versions: string[];
  empty: boolean;
  rows: BenefitMatrixRow[];
  completeness: BenefitMatrixCompleteness;
};

export type MatrixMapRow = {
  id: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
  mapsToSlotLabels: string | null;
  mapMode: string;
  status: string;
  benefitBatch: string | null;
  versionLabelForTemplate: string | null;
};

export type MatrixTemplate = CatalogTemplate & {
  status: string;
  isDeprecated?: boolean;
  mainImageUrl?: string | null;
};

export type BuildBenefitMatrixInput = {
  release: BenefitMatrix["release"];
  versions: string[];
  maps: MatrixMapRow[];
  templates: MatrixTemplate[];
  dict: ChannelDictionary;
};

function channelNameZh(code: string, dict: ChannelDictionary) {
  const hit = dict.channels.find((c) => c.code === code);
  return hit?.name_zh || code;
}

/** Release.versions; empty → standard default bucket. */
export function resolveReleaseVersions(versions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of versions || []) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out : [DEFAULT_VERSION_BUCKET];
}

function slotVersionOf(row: MatrixMapRow) {
  return (row.versionLabelForTemplate || row.versionLabel || "").trim();
}

function templateStatusOf(t: MatrixTemplate): Exclude<TemplateStatus, "missing"> {
  if (t.isDeprecated) return "draft";
  return t.status === "published" ? "published" : "draft";
}

function resolveSlots(row: MatrixMapRow, templates: MatrixTemplate[]): BenefitMatrixSlot[] {
  if (row.mapMode !== "slots") return [];
  const labels = splitSlotLabels(row.mapsToSlotLabels || "");
  const wantVersion = slotVersionOf(row);
  const out: BenefitMatrixSlot[] = [];
  for (const label of labels) {
    const matches = templates.filter(
      (t) =>
        !t.isDeprecated &&
        templateMatchesSlot(t, label) &&
        t.versionLabel.trim().toLowerCase() === wantVersion.toLowerCase(),
    );
    if (!matches.length) {
      out.push({
        label,
        version: wantVersion,
        templateId: null,
        templateName: null,
        templateStatus: "missing",
        navigable: false,
        imageUrl: null,
      });
      continue;
    }
    for (const t of matches) {
      const status = templateStatusOf(t);
      const navigable = status === "published";
      const rawImage = t.mainImageUrl == null ? "" : String(t.mainImageUrl).trim();
      out.push({
        label,
        version: wantVersion,
        templateId: t.id,
        templateName: t.name,
        templateStatus: status,
        navigable,
        imageUrl: navigable && rawImage ? rawImage : null,
      });
    }
  }
  return out;
}

export function buildCompleteness(slots: BenefitMatrixSlot[], empty: boolean): BenefitMatrixCompleteness {
  const total = slots.length;
  const published = slots.filter((s) => s.templateStatus === "published").length;
  const ratio = total === 0 ? 0 : published / total;
  const ready = !empty && total > 0 && published === total;
  return {
    ready,
    ratio,
    copy: ready ? BENEFIT_MATRIX_READY_COPY : BENEFIT_MATRIX_INCOMPLETE_COPY,
  };
}

/** Pure assembler (VB03 / VB04). Caller injects confirmed maps; drafting/retired are dropped. */
export function buildBenefitMatrix(input: BuildBenefitMatrixInput): BenefitMatrix {
  const versions = resolveReleaseVersions(input.versions);
  const rows: BenefitMatrixRow[] = [];
  for (const map of input.maps || []) {
    if (String(map.status || "").trim() !== "confirmed") continue;
    rows.push({
      id: map.id,
      versionLabel: map.versionLabel,
      benefitNameZh: map.benefitNameZh,
      channelCode: map.channelCode,
      channelNameZh: channelNameZh(map.channelCode, input.dict),
      benefitBatch: map.benefitBatch,
      mapMode: map.mapMode,
      slots: resolveSlots(map, input.templates),
    });
  }
  const empty = rows.length === 0;
  const slots = rows.flatMap((r) => r.slots);
  return {
    release: input.release,
    versions,
    empty,
    rows,
    completeness: buildCompleteness(slots, empty),
  };
}
