export type BenefitIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  row?: number;
  field?: string;
};

export type BenefitReport = {
  ok: boolean;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  issues: BenefitIssue[];
};

export type BenefitMapRow = {
  id: string;
  groupSlug: string;
  releaseId: string;
  releaseTitle: string;
  versionLabel: string;
  channelCode: string;
  benefitNameZh: string;
  mapsToSlotLabels: string | null;
  mapMode: string;
  evidenceUrl: string | null;
  status: string;
};

export type BenefitReleaseOpt = { id: string; title: string; groupNameZh?: string };

export const BENEFIT_CSV_PLACEHOLDER = `group_id,release_id,version_label,channel_code,benefit_name_zh,maps_to_slot_labels,map_mode,evidence_url,status,benefit_batch,benefit_type,tags_hint
bts,bts-arirang,standard,weverse,预购特典 Weverse,预购特典 Weverse,slots,https://example.invalid/weverse-arirang-pob,confirmed,1.0,pob,"特典,预购"`;

/** Soft-retired: legacy HTML admin is not shipped; keep signature so main.ts still compiles. */
export function benefitMapView(_opts: {
  text: string;
  notice: string;
  report: BenefitReport | null;
  committed: boolean;
  written: number;
  maps: BenefitMapRow[];
  releases: BenefitReleaseOpt[];
  releaseFilter: string;
  tagsStrict: boolean;
}) {
  return `
    <section class="card">
      <p class="banner warn">对照表路径已废弃。请维护「特典词典」与「小卡模板/维护」，不要再导入版本×特典对照表。</p>
      <h1>图鉴 · 特典对照表已下线</h1>
      <p class="muted">深链到达本页时请改用 <a href="#/catalog/benefits">特典词典</a> 维护特典条目，卡面请到 <a href="#/catalog/templates">小卡模板/维护</a>。</p>
    </section>`;
}
