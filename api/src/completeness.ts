import { query } from "./db.js";
import { allowedReleaseIdsFor } from "./catalogConstraints.js";

export type PublishGate = {
  status: "published" | "ready" | "incomplete" | "blocked" | "open";
  canPublish: boolean;
  blockers: { code: string; message: string }[];
  /** Signer workflow is intentionally not in this slice. */
  signOff: null;
  signOffNote: string;
};

export type CompletenessRelease = {
  id: string;
  title: string;
  titleZh: string | null;
  kind: string;
  status: string;
  releasedOn: string | null;
  draftCount: number;
  publishedCount: number;
  deprecatedCount: number;
  missingMainImage: number;
  missingMembers: { id: string; nameEn: string; nameZh: string | null }[];
  inAllowedSlice: boolean | null;
  publishGate: PublishGate;
};

export type CompletenessGroup = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  status: string;
  draftCount: number;
  publishedCount: number;
  deprecatedCount: number;
  missingMainImage: number;
  missingMembers: number;
  constraint: {
    configured: boolean;
    allowedReleaseIds: string[];
  };
  expansionGate: PublishGate;
  releases: CompletenessRelease[];
};

const SIGN_OFF_NOTE = "签署人流程未接入（本切片只展示闸门）";

function dateOnly(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (!v) return null;
  return String(v).slice(0, 10);
}

function gate(status: PublishGate["status"], blockers: PublishGate["blockers"]): PublishGate {
  return {
    status,
    canPublish: status === "ready" || status === "published" || status === "open",
    blockers,
    signOff: null,
    signOffNote: SIGN_OFF_NOTE,
  };
}

export async function getCompletenessDashboard(): Promise<{ groups: CompletenessGroup[] }> {
  const groups = await query(
    `SELECT id, slug, name_zh, name_en, status FROM idol_groups ORDER BY slug`,
  );
  const releases = await query(
    `SELECT id, group_id, title, title_zh, kind, status, released_on
     FROM releases ORDER BY released_on DESC, title`,
  );
  const members = await query(
    `SELECT id, group_id, name_en, name_zh, status FROM members ORDER BY sort_order, name_en`,
  );
  const templates = await query(
    `SELECT id, release_id, member_id, status, is_deprecated, main_image_url FROM templates`,
  );

  const relByGroup = new Map<string, typeof releases.rows>();
  for (const r of releases.rows) {
    const gid = String(r.group_id);
    const list = relByGroup.get(gid) || [];
    list.push(r);
    relByGroup.set(gid, list);
  }
  const memByGroup = new Map<string, typeof members.rows>();
  for (const m of members.rows) {
    const gid = String(m.group_id);
    const list = memByGroup.get(gid) || [];
    list.push(m);
    memByGroup.set(gid, list);
  }
  const tplByRelease = new Map<string, typeof templates.rows>();
  for (const t of templates.rows) {
    const rid = String(t.release_id);
    const list = tplByRelease.get(rid) || [];
    list.push(t);
    tplByRelease.set(rid, list);
  }

  const out: CompletenessGroup[] = groups.rows.map((g) => {
    const slug = String(g.slug);
    const allowed = allowedReleaseIdsFor(slug);
    const publishedMembers = (memByGroup.get(String(g.id)) || []).filter((m) => m.status === "published");
    const rels: CompletenessRelease[] = (relByGroup.get(String(g.id)) || []).map((r) => {
      const tpls = tplByRelease.get(String(r.id)) || [];
      let draftCount = 0;
      let publishedCount = 0;
      let deprecatedCount = 0;
      let missingMainImage = 0;
      const covered = new Set<string>();
      for (const t of tpls) {
        if (t.is_deprecated) deprecatedCount += 1;
        else if (t.status === "published") publishedCount += 1;
        else draftCount += 1;
        if (!t.is_deprecated && !t.main_image_url) missingMainImage += 1;
        if (!t.is_deprecated && t.member_id) covered.add(String(t.member_id));
      }
      const missingMembers = publishedMembers
        .filter((m) => !covered.has(String(m.id)))
        .map((m) => ({
          id: String(m.id),
          nameEn: String(m.name_en),
          nameZh: m.name_zh == null ? null : String(m.name_zh),
        }));
      const blockers: PublishGate["blockers"] = [];
      const inSlice = allowed ? allowed.includes(String(r.id)) : null;
      if (inSlice === false) {
        blockers.push({
          code: "CATALOG_CONSTRAINT",
          message: `不在 ${slug} 允许的 release_id 切片内`,
        });
      }
      if (missingMainImage > 0) {
        blockers.push({ code: "IMAGE_REQUIRED", message: `${missingMainImage} 张模板缺主图` });
      }
      if (missingMembers.length > 0) {
        blockers.push({
          code: "MISSING_MEMBERS",
          message: `缺 ${missingMembers.length} 名成员小卡：${missingMembers.map((m) => m.nameEn).join(", ")}`,
        });
      }
      let status: PublishGate["status"];
      if (inSlice === false) status = "blocked";
      else if (String(r.status) === "published") status = "published";
      else if (blockers.length) status = "incomplete";
      else if (String(r.status) === "draft") status = "ready";
      else status = "open";
      return {
        id: String(r.id),
        title: String(r.title),
        titleZh: r.title_zh == null ? null : String(r.title_zh),
        kind: String(r.kind || "album"),
        status: String(r.status),
        releasedOn: dateOnly(r.released_on),
        draftCount,
        publishedCount,
        deprecatedCount,
        missingMainImage,
        missingMembers,
        inAllowedSlice: inSlice,
        publishGate: gate(status, blockers),
      };
    });

    const draftCount = rels.reduce((n, r) => n + r.draftCount, 0);
    const publishedCount = rels.reduce((n, r) => n + r.publishedCount, 0);
    const deprecatedCount = rels.reduce((n, r) => n + r.deprecatedCount, 0);
    const missingMainImage = rels.reduce((n, r) => n + r.missingMainImage, 0);
    const missingMembers = rels.reduce((n, r) => n + r.missingMembers.length, 0);
    const expansionBlockers: PublishGate["blockers"] = [];
    if (allowed) {
      expansionBlockers.push({
        code: "CATALOG_CONSTRAINT",
        message: `组合 ${slug} 仅允许已配置的 release_id 切片，下一张专辑需更新 allowlist 后才能发布`,
      });
    }
    const expansionStatus: PublishGate["status"] = allowed ? "blocked" : "open";
    return {
      id: String(g.id),
      slug,
      nameZh: String(g.name_zh),
      nameEn: String(g.name_en),
      status: String(g.status),
      draftCount,
      publishedCount,
      deprecatedCount,
      missingMainImage,
      missingMembers,
      constraint: {
        configured: !!allowed,
        allowedReleaseIds: allowed || [],
      },
      expansionGate: gate(expansionStatus, expansionBlockers),
      releases: rels,
    };
  });

  return { groups: out };
}
