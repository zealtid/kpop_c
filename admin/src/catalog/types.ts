export type CatalogCrudTab = "groups" | "members" | "releases" | "templates";
export type CatalogLaterTab = "completeness" | "benefits";
export type CatalogTab = CatalogCrudTab | CatalogLaterTab | "import";

export type Group = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  nameKo?: string;
  aliases?: string;
  logoColor?: string;
  scopeNote?: string | null;
  isPilot?: boolean;
  status: string;
};

export type Member = {
  id: string;
  groupId: string;
  nameZh: string;
  nameEn: string;
  nameKo?: string;
  aliases?: string;
  color?: string;
  sortOrder?: number;
  status: string;
  groupNameZh?: string;
};

export type Release = {
  id: string;
  groupId: string;
  title: string;
  titleZh?: string | null;
  aliases?: string;
  releasedOn?: string | null;
  kind: string;
  status: string;
  groupNameZh?: string;
};

export type Template = {
  id: string;
  name: string;
  version: string;
  code?: string;
  status: string;
  catalogStatus?: string;
  isBenefit?: boolean;
  isDeprecated?: boolean;
  mainImageUrl?: string | null;
  dedupeKey?: string;
  releaseId: string;
  releaseTitle?: string;
  memberId?: string | null;
  memberNameEn?: string | null;
  groupNameZh?: string;
};

export type CatalogBundle = {
  groups: Group[];
  members: Member[];
  releases: Release[];
  templates: Template[];
};

export const CATALOG_TABS: { id: CatalogTab; label: string; later?: boolean }[] = [
  { id: "groups", label: "组合" },
  { id: "members", label: "成员" },
  { id: "releases", label: "发行" },
  { id: "templates", label: "小卡模板" },
  { id: "import", label: "导入" },
  { id: "completeness", label: "完整度", later: true },
  { id: "benefits", label: "特典对照", later: true },
];

export const CRUD_TABS: CatalogCrudTab[] = ["groups", "members", "releases", "templates"];

export const RELEASE_KINDS = [
  { value: "album", label: "专辑 album" },
  { value: "single", label: "单曲 single" },
  { value: "mini", label: "迷你 mini" },
  { value: "concert_md", label: "演唱会特典 concert_md" },
];

export function isCrudTab(tab: string): tab is CatalogCrudTab {
  return (CRUD_TABS as string[]).includes(tab);
}

export function isLaterTab(tab: string) {
  return tab === "completeness" || tab === "benefits";
}

export function parseCatalogTab(raw: unknown): CatalogTab {
  const value = String(raw || "");
  if (CATALOG_TABS.some((t) => t.id === value)) return value as CatalogTab;
  return "groups";
}

export function rowStatus(row: { status: string; catalogStatus?: string; isDeprecated?: boolean }) {
  return row.catalogStatus || (row.isDeprecated ? "deprecated" : row.status);
}

export function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "deprecated") return "已废弃";
  if (status === "draft") return "草稿";
  return status;
}
