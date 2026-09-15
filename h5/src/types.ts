export type ShareSummary = {
  kind: "group" | "release" | "template";
  group?: {
    id: string;
    slug: string;
    nameZh: string;
    nameEn: string;
    logoColor: string;
    logoUrl?: string | null;
    scopeNote: string | null;
    publishedReleaseCount: number;
    publishedTemplateCount: number;
    releases: { id: string; title: string; titleZh: string | null; releasedOn: string | null; kind: string }[];
  };
  release?: {
    id: string;
    title: string;
    titleZh: string | null;
    releasedOn: string | null;
    kind: string;
    groupId: string;
    groupSlug: string;
    groupNameZh: string;
    publishedTemplateCount: number;
  };
  template?: {
    id: string;
    code: string;
    name: string;
    version: string;
    mainImageUrl: string | null;
    backImageUrl: string | null;
    memberNameEn: string | null;
    memberNameZh: string | null;
    memberColor: string | null;
    releaseId: string;
    releaseTitle: string;
    groupSlug: string;
    groupNameZh: string;
  };
  mini: { path: string; query: string; page: string };
  cta: {
    title: string;
    hint: string;
    urlScheme: string | null;
    urlLink?: string | null;
    ghId: string | null;
    appId?: string | null;
    canJump?: boolean;
    missing?: string[];
  };
};

export type CatalogGroup = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  logoColor: string;
  logoUrl?: string | null;
  scopeNote: string | null;
};

export type CatalogRelease = {
  id: string;
  title: string;
  title_zh?: string | null;
  titleZh?: string | null;
  released_on?: string | null;
  releasedOn?: string | null;
  kind?: string;
  status?: string;
};

export type CatalogTemplate = {
  id: string;
  code: string;
  name: string;
  version: string;
  mainImageUrl: string | null;
  backImageUrl?: string | null;
  memberNameEn?: string | null;
  memberNameZh?: string | null;
  memberColor?: string | null;
  releaseTitle?: string;
  groupSlug?: string;
  groupNameZh?: string;
  releaseId?: string;
};

export type H5Bootstrap = {
  webOAuth: boolean;
  mockAuth: boolean;
  mini: { appId: string | null; ghId: string | null; urlScheme: string | null; urlLink?: string | null };
  cta: {
    title: string;
    hint: string;
    urlScheme: string | null;
    urlLink?: string | null;
    ghId: string | null;
    appId?: string | null;
    canJump?: boolean;
    missing?: string[];
  };
  jsSdk?: boolean;
  canJump?: boolean;
  missing?: string[];
  reason?: string;
  publicBaseUrl: string;
};
