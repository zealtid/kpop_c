import { query } from "./db.js";
import { badRequest } from "./errors.js";
import { getGroup, getPublicTemplate, getRelease, listReleases } from "./catalog.js";
import { config } from "./config.js";

export type ShareKind = "group" | "release" | "template";

export type ShareMiniLink = {
  path: string;
  query: string;
  page: string;
};

export type ShareSummary = {
  kind: ShareKind;
  group?: {
    id: string;
    slug: string;
    nameZh: string;
    nameEn: string;
    logoColor: string;
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
  mini: ShareMiniLink;
  cta: {
    title: string;
    hint: string;
    urlScheme: string | null;
    ghId: string | null;
  };
};

function miniLink(page: string, query: string): ShareMiniLink {
  const q = query.replace(/^\?/, "");
  return { path: q ? `${page}?${q}` : page, query: q, page };
}

export function shareCta() {
  return {
    title: "打开星卡小程序",
    hint: "打不开时请长按复制路径，微信搜索「星卡」后粘贴；或扫描分享图二维码",
    urlScheme: config.wxUrlScheme || null,
    ghId: config.wxMiniGhId || null,
  };
}

async function countPublishedTemplates(opts: { groupId?: string; releaseId?: string }) {
  const conds = ["t.status = 'published'", "r.status = 'published'", "g.status = 'published'"];
  const params: unknown[] = [];
  if (opts.groupId) {
    params.push(opts.groupId);
    conds.push(`r.group_id = $${params.length}`);
  }
  if (opts.releaseId) {
    params.push(opts.releaseId);
    conds.push(`t.release_id = $${params.length}`);
  }
  const r = await query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM templates t
     JOIN releases r ON r.id = t.release_id
     JOIN idol_groups g ON g.id = r.group_id
     WHERE ${conds.join(" AND ")}`,
    params,
  );
  return Number(r.rows[0]?.n || 0);
}

export async function groupShareSummary(idOrSlug: string): Promise<ShareSummary> {
  const group = await getGroup(idOrSlug, { requirePublished: true });
  const releases = await listReleases(String(group.id));
  const publishedTemplateCount = await countPublishedTemplates({ groupId: String(group.id) });
  return {
    kind: "group",
    group: {
      id: String(group.id),
      slug: String(group.slug),
      nameZh: String(group.nameZh),
      nameEn: String(group.nameEn),
      logoColor: String(group.logoColor || "#6b5cff"),
      scopeNote: group.scopeNote ? String(group.scopeNote) : null,
      publishedReleaseCount: releases.length,
      publishedTemplateCount,
      releases: releases.slice(0, 12).map((row) => ({
        id: String(row.id),
        title: String(row.title),
        titleZh: row.title_zh == null ? null : String(row.title_zh),
        releasedOn:
          row.released_on instanceof Date
            ? row.released_on.toISOString().slice(0, 10)
            : row.released_on
              ? String(row.released_on).slice(0, 10)
              : null,
        kind: String(row.kind || "album"),
      })),
    },
    mini: miniLink("pages/catalog-group/index", `id=${group.slug}`),
    cta: shareCta(),
  };
}

export async function releaseShareSummary(id: string): Promise<ShareSummary> {
  const release = await getRelease(id, { requirePublished: true });
  const publishedCount = await countPublishedTemplates({ releaseId: release.id });
  return {
    kind: "release",
    release: {
      id: release.id,
      title: release.title,
      titleZh: release.titleZh,
      releasedOn: release.releasedOn,
      kind: release.kind,
      groupId: release.groupId,
      groupSlug: String(release.groupSlug || ""),
      groupNameZh: String(release.groupNameZh || ""),
      publishedTemplateCount: publishedCount,
    },
    mini: miniLink("pages/catalog-release/index", `id=${release.id}`),
    cta: shareCta(),
  };
}

export async function templateShareSummary(id: string): Promise<ShareSummary> {
  const t = await getPublicTemplate(id);
  const q = encodeURIComponent(String(t.code || t.name || ""));
  return {
    kind: "template",
    template: {
      id: String(t.id),
      code: String(t.code),
      name: String(t.name),
      version: String(t.version),
      mainImageUrl: t.mainImageUrl ? String(t.mainImageUrl) : null,
      backImageUrl: null,
      memberNameEn: t.memberNameEn ? String(t.memberNameEn) : null,
      memberNameZh: t.memberNameZh ? String(t.memberNameZh) : null,
      memberColor: t.memberColor ? String(t.memberColor) : null,
      releaseId: String(t.releaseId),
      releaseTitle: String(t.releaseTitle || ""),
      groupSlug: String(t.groupSlug || ""),
      groupNameZh: String(t.groupNameZh || ""),
    },
    mini: miniLink("pages/catalog-search/index", `q=${q}`),
    cta: shareCta(),
  };
}

/** Published-only public share payload. Never includes private albums, pending UGC, or tickets. */
export async function getShareSummary(input: { g?: string; r?: string; t?: string }): Promise<ShareSummary> {
  const t = String(input.t || "").trim();
  const r = String(input.r || "").trim();
  const g = String(input.g || "").trim();
  if (t) return templateShareSummary(t);
  if (r) return releaseShareSummary(r);
  if (g) return groupShareSummary(g);
  throw badRequest("缺少分享参数 g / r / t");
}

export function h5LandingUrl(input: { g?: string; r?: string; t?: string }): string | null {
  const base = (config.h5PublicUrl || "").replace(/\/$/, "");
  if (!base) return null;
  const params = new URLSearchParams();
  if (input.g) params.set("g", String(input.g));
  if (input.r) params.set("r", String(input.r));
  if (input.t) params.set("t", String(input.t));
  const q = params.toString();
  return q ? `${base}/#/?${q}` : `${base}/#/`;
}
