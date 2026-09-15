<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NInput,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import { errorMessage, mediaUrl } from "../api";
import {
  deleteCatalog,
  hardDeleteTemplates,
  loadAdminTemplates,
  loadCatalogLookups,
  saveCatalog,
  setCatalogStatus,
} from "../catalog/api";
import {
  CATALOG_TABS,
  isBenefitsTab,
  isCompletenessTab,
  isCrudTab,
  parseCatalogTab,
  rowStatus,
  statusLabel,
  type CatalogBundle,
  type CatalogCrudTab,
  type CatalogTab,
  type Group,
  type Member,
  type Release,
  type Template,
} from "../catalog/types";
import AdminEmptyState from "../components/AdminEmptyState.vue";
import AdminFilterBar from "../components/AdminFilterBar.vue";
import CatalogFormModal from "../components/catalog/CatalogFormModal.vue";
import PageHeader from "../components/PageHeader.vue";
import StatusActions from "../components/catalog/StatusActions.vue";
import CatalogBenefitsView from "./CatalogBenefitsView.vue";
import CatalogCompletenessView from "./CatalogCompletenessView.vue";
import CatalogImportView from "./CatalogImportView.vue";
import { maxPage, parsePage, parsePageSize, parseQueryText, patchListQuery, slicePage } from "../listQuery";
import { useNarrow } from "../narrow";

type AnyRow = Group | Member | Release | Template;

const TEMPLATE_CAP = 200;

const STATUS_OPTIONS = [
  { label: "全部状态", value: "" },
  { label: "草稿", value: "draft" },
  { label: "已发布", value: "published" },
  { label: "已废弃", value: "deprecated" },
];

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const { isNarrow } = useNarrow();
const checkedRowKeys = ref<Array<string | number>>([]);

const tab = computed(() => parseCatalogTab(route.params.tab));
const crudTab = computed<CatalogCrudTab>(() => (isCrudTab(tab.value) ? tab.value : "groups"));
const isBenefits = computed(() => isBenefitsTab(tab.value));
const isCompleteness = computed(() => isCompletenessTab(tab.value));
const isImport = computed(() => tab.value === "import");

const loading = ref(true);
const acting = ref(false);
const deny = ref("");
const bundle = ref<CatalogBundle>({ groups: [], members: [], releases: [], templates: [] });
const formShow = ref(false);
const editing = ref<AnyRow | null>(null);
const keywordDraft = ref("");
const templatesCapped = ref(false);

const headings: Record<CatalogTab, { title: string; hint: string }> = {
  groups: { title: "图鉴 · 组合", hint: "ArtistGroup → idol_groups。可上传公开团图标（icon_url）；无图标时 C 端回退主题色与首字。" },
  members: { title: "图鉴 · 成员", hint: "Member。草稿成员不出现在小程序组合页。" },
  releases: { title: "图鉴 · 发行", hint: "Release。演唱会特典用 kind=concert_md，没有独立 Event 表。" },
  templates: {
    title: "图鉴 · 小卡模板/维护",
    hint: "在此添加官方图鉴小卡：点「新建小卡」填发行与版本，上传正面主图（必填）和卡背（可选）到 /media/cards，再发布。无主图不能发布。行内「删除」为永久硬删，与「废弃」不同。",
  },
  completeness: { title: "图鉴 · 完整度", hint: "按组合查看发行闸门与缺图/缺成员。缺图可跳到模板维护。" },
  import: { title: "图鉴 · 导入校验", hint: "校验 CSV / Markdown / JSON，通过后再写入。" },
  benefits: { title: "图鉴 · 特典对照", hint: "通路词典可增改/停用（喂给 C 端特典搜索）。B2 CSV 导入不变；对照单行修补为次要。" },
};

const pageNotice = ref("");
const pageNoticeOk = ref(false);

const filterQ = computed(() => parseQueryText(route.query.q).trim());
const filterStatus = computed(() => parseQueryText(route.query.status));
const filterGroupId = computed(() => parseQueryText(route.query.groupId));
const filterReleaseId = computed(() => parseQueryText(route.query.releaseId));
const page = computed(() => parsePage(route.query.page));
const pageSize = computed(() => parsePageSize(route.query.pageSize));

const groupOptions = computed(() => [
  { label: "全部组合", value: "" },
  ...bundle.value.groups.map((g) => ({ label: `${g.nameZh} (${g.slug})`, value: g.id })),
]);

const releaseOptions = computed(() => {
  const list = filterGroupId.value
    ? bundle.value.releases.filter((r) => r.groupId === filterGroupId.value)
    : bundle.value.releases;
  return [
    { label: "全部发行", value: "" },
    ...list.map((r) => ({
      label: r.groupNameZh ? `${r.groupNameZh} · ${r.title}` : r.title,
      value: r.id,
    })),
  ];
});

const allRows = computed<AnyRow[]>(() => {
  const data = bundle.value;
  if (tab.value === "members") return data.members;
  if (tab.value === "releases") return data.releases;
  if (tab.value === "templates") return data.templates;
  return data.groups;
});

function matchesStatus(row: AnyRow) {
  if (!filterStatus.value) return true;
  return rowStatus(row) === filterStatus.value;
}

function matchesKeyword(row: AnyRow, q: string) {
  if (!q) return true;
  const hay = (() => {
    if (tab.value === "members") {
      const m = row as Member;
      return `${m.nameEn} ${m.nameZh} ${m.groupNameZh || ""}`;
    }
    if (tab.value === "releases") {
      const r = row as Release;
      return `${r.title} ${r.titleZh || ""} ${r.groupNameZh || ""} ${r.kind}`;
    }
    if (tab.value === "templates") {
      const t = row as Template;
      return `${t.name} ${t.releaseTitle || ""} ${t.memberNameEn || ""} ${t.version}`;
    }
    const g = row as Group;
    return `${g.nameZh} ${g.nameEn} ${g.slug}`;
  })();
  return hay.toLowerCase().includes(q);
}

const filteredRows = computed<AnyRow[]>(() => {
  if (tab.value === "templates") {
    // 关键词 / 状态 / 组合 / 发行已走 searchTemplates
    return allRows.value;
  }
  const q = filterQ.value.toLowerCase();
  return allRows.value.filter((row) => {
    if (!matchesStatus(row)) return false;
    if (tab.value === "members" && filterGroupId.value && (row as Member).groupId !== filterGroupId.value) {
      return false;
    }
    if (tab.value === "releases" && filterGroupId.value && (row as Release).groupId !== filterGroupId.value) {
      return false;
    }
    return matchesKeyword(row, q);
  });
});

const itemCount = computed(() => filteredRows.value.length);

const pagedRows = computed(() => slicePage(filteredRows.value, page.value, pageSize.value));

function setQuery(patch: Record<string, string | number | undefined | null>) {
  void patchListQuery(router, route.query, patch);
}

function onTab(next: string) {
  void router.push({ name: "catalog", params: { tab: next }, query: {} });
}

function onSearch() {
  setQuery({ q: keywordDraft.value.trim() || undefined, page: 1 });
}

function onReset() {
  keywordDraft.value = "";
  setQuery({
    q: undefined,
    status: undefined,
    groupId: undefined,
    releaseId: undefined,
    page: 1,
    pageSize: undefined,
  });
}

const rows = computed(() => pagedRows.value);

function statusTag(status: string) {
  const type = status === "published" ? "success" : status === "deprecated" ? "error" : "default";
  return h(NTag, { size: "small", type, bordered: false }, { default: () => statusLabel(status) });
}

function nameButton(label: string, row: AnyRow) {
  return h(
    NButton,
    { text: true, type: "primary", onClick: () => openEdit(row) },
    { default: () => label || "（无名称）" },
  );
}

function canHardDelete(row: AnyRow) {
  if (tab.value === "templates") return true;
  const st = rowStatus(row);
  return st === "draft" || st === "deprecated";
}

function actionsCell(row: AnyRow) {
  const maintain = h(
    NButton,
    { size: "tiny", type: "primary", onClick: () => openEdit(row) },
    { default: () => "维护" },
  );
  const nodes = [
    maintain,
    h(StatusActions, {
      status: rowStatus(row),
      pending: acting.value,
      onAct: (status: "published" | "draft" | "deprecated") => void onStatus(row, status),
    }),
  ];
  if (canHardDelete(row)) {
    nodes.push(
      h(
        NButton,
        {
          size: "tiny",
          type: "error",
          ghost: true,
          disabled: acting.value,
          onClick: () => confirmHardDelete(row),
        },
        { default: () => "删除" },
      ),
    );
  }
  return h("div", { class: "row-actions" }, nodes);
}

const selectionColumn: DataTableColumns<AnyRow>[number] = {
  type: "selection",
  disabled: () => acting.value,
};

const columns = computed<DataTableColumns<AnyRow>>(() => {
  if (tab.value === "members") {
    return [
      selectionColumn,
      { title: "英文", key: "nameEn", render: (row) => nameButton((row as Member).nameEn, row) },
      { title: "中文", key: "nameZh", render: (row) => (row as Member).nameZh || "" },
      { title: "组合", key: "groupNameZh", render: (row) => (row as Member).groupNameZh || "" },
      { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
      { title: "", key: "actions", width: 280, render: (row) => actionsCell(row) },
    ];
  }
  if (tab.value === "releases") {
    return [
      selectionColumn,
      { title: "标题", key: "title", render: (row) => nameButton((row as Release).title, row) },
      { title: "组合", key: "groupNameZh", render: (row) => (row as Release).groupNameZh || "" },
      {
        title: "类型",
        key: "kind",
        render: (row) => {
          const r = row as Release;
          return r.kind === "concert_md" ? `${r.kind} · 特典` : r.kind;
        },
      },
      { title: "日期", key: "releasedOn", width: 120, render: (row) => (row as Release).releasedOn || "" },
      { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
      { title: "", key: "actions", width: 280, render: (row) => actionsCell(row) },
    ];
  }
  if (tab.value === "templates") {
    return [
      selectionColumn,
      { title: "名称", key: "name", render: (row) => nameButton((row as Template).name, row) },
      { title: "发行", key: "releaseTitle", render: (row) => (row as Template).releaseTitle || "" },
      { title: "成员", key: "memberNameEn", render: (row) => (row as Template).memberNameEn || "group" },
      { title: "版本", key: "version", width: 88, render: (row) => (row as Template).version },
      { title: "", key: "isBenefit", width: 56, render: (row) => ((row as Template).isBenefit ? "特典" : "") },
      {
        title: "图",
        key: "mainImageUrl",
        width: 72,
        render: (row) => {
          const t = row as Template;
          const src = mediaUrl(t.mainImageUrl);
          if (src) return h("img", { class: "tpl-thumb", src, alt: "" });
          return h("span", { style: "color: var(--color-warning)" }, "无主图");
        },
      },
      { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
      { title: "", key: "actions", width: 280, render: (row) => actionsCell(row) },
    ];
  }
  return [
    selectionColumn,
    {
      title: "名称",
      key: "nameZh",
      render: (row) => {
        const g = row as Group;
        const src = mediaUrl(g.iconUrl || g.logoUrl);
        return h("div", { class: "name-with-logo" }, [
          src
            ? h("img", { class: "group-thumb", src, alt: "" })
            : h("span", { class: "group-letter", style: { background: g.logoColor || "#ff6b9d" } }, (g.nameZh || "?").slice(0, 1)),
          nameButton(g.nameZh, row),
        ]);
      },
    },
    { title: "slug", key: "slug", render: (row) => (row as Group).slug },
    {
      title: "UGC",
      key: "ugcOpen",
      width: 72,
      render: (row) => ((row as Group).ugcOpen ? "开" : "关"),
    },
    { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
    { title: "", key: "actions", width: 280, render: (row) => actionsCell(row) },
  ];
});

function cardTitle(row: AnyRow) {
  if (tab.value === "members") return (row as Member).nameEn;
  if (tab.value === "releases") return (row as Release).title;
  if (tab.value === "templates") return (row as Template).name;
  return (row as Group).nameZh;
}

function cardMeta(row: AnyRow) {
  if (tab.value === "members") return (row as Member).groupNameZh || "";
  if (tab.value === "releases") return `${(row as Release).groupNameZh || ""} · ${(row as Release).kind}`;
  if (tab.value === "templates") {
    const t = row as Template;
    return `${t.releaseTitle || ""} · ${t.version}${t.mainImageUrl ? "" : " · 无主图"}`;
  }
  return (row as Group).slug;
}

function cardThumb(row: AnyRow) {
  if (tab.value === "templates") return mediaUrl((row as Template).mainImageUrl);
  if (tab.value === "groups") return mediaUrl((row as Group).iconUrl || (row as Group).logoUrl);
  return "";
}

function cardLetter(row: AnyRow) {
  const g = row as Group;
  return { color: g.logoColor || "#ff6b9d", text: (g.nameZh || "?").slice(0, 1) };
}

async function refreshLookups() {
  const result = await loadCatalogLookups();
  if (!result.ok) {
    deny.value = result.message;
    bundle.value = { groups: [], members: [], releases: [], templates: [] };
    return false;
  }
  deny.value = "";
  bundle.value = { ...result.data, templates: bundle.value.templates };
  return true;
}

async function refreshTemplates() {
  const result = await loadAdminTemplates({
    q: filterQ.value || undefined,
    groupId: filterGroupId.value || undefined,
    releaseId: filterReleaseId.value || undefined,
    status: filterStatus.value || undefined,
  });
  if (!result.ok) {
    deny.value = result.message;
    bundle.value = { ...bundle.value, templates: [] };
    templatesCapped.value = false;
    return false;
  }
  deny.value = "";
  bundle.value = { ...bundle.value, templates: result.templates };
  templatesCapped.value = result.templates.length >= TEMPLATE_CAP;
  return true;
}

async function refresh() {
  loading.value = true;
  const okLookups = await refreshLookups();
  if (okLookups && tab.value === "templates") await refreshTemplates();
  loading.value = false;
}

function openCreate() {
  editing.value = null;
  formShow.value = true;
}

function openEdit(row: AnyRow) {
  editing.value = row;
  formShow.value = true;
}

async function onSave(payload: Record<string, unknown>, publish = false) {
  if (!isCrudTab(tab.value)) return;
  const mainImage = typeof payload.mainImageUrl === "string" ? payload.mainImageUrl.trim() : "";
  if (publish && tab.value === "templates" && !mainImage) {
    message.error("未设置主图的模板不能发布");
    return;
  }
  const editingId = editing.value?.id || null;
  acting.value = true;
  const res = await saveCatalog(tab.value, editingId, payload);
  if (res.status !== 200) {
    acting.value = false;
    const msg = errorMessage(res.body);
    pageNotice.value = msg;
    pageNoticeOk.value = false;
    message.error(msg);
    return;
  }
  const savedId =
    editingId || (typeof (res.body as { id?: unknown })?.id === "string" ? (res.body as { id: string }).id : "");

  if (publish && tab.value === "templates" && savedId) {
    const statusRes = await setCatalogStatus(tab.value, savedId, "published");
    acting.value = false;
    if (statusRes.status !== 200) {
      const msg = errorMessage(statusRes.body);
      pageNotice.value = msg;
      pageNoticeOk.value = false;
      message.error(msg);
      formShow.value = false;
      editing.value = null;
      await refresh();
      reopenTemplate(savedId, payload);
      return;
    }
    pageNotice.value = "已保存并发布";
    pageNoticeOk.value = true;
    formShow.value = false;
    editing.value = null;
    message.success(pageNotice.value);
    await refresh();
    return;
  }

  acting.value = false;
  const createdWithoutImage = tab.value === "templates" && !editingId && !mainImage && !!savedId;
  pageNotice.value = editingId ? "已保存" : "已创建为草稿";
  pageNoticeOk.value = true;
  if (createdWithoutImage) {
    message.success("已创建草稿，请上传正面主图后再发布");
    await refresh();
    reopenTemplate(savedId, payload);
    return;
  }
  formShow.value = false;
  editing.value = null;
  await nextTick();
  message.success(pageNotice.value);
  await refresh();
}

function reopenTemplate(id: string, payload: Record<string, unknown>) {
  const found = bundle.value.templates.find((t) => t.id === id);
  if (found) {
    openEdit(found);
    return;
  }
  const releaseId = String(payload.releaseId || "");
  const rel = bundle.value.releases.find((r) => r.id === releaseId);
  const memberId = payload.memberId ? String(payload.memberId) : "";
  const mem = bundle.value.members.find((m) => m.id === memberId);
  openEdit({
    id,
    name: String(payload.name || ""),
    version: String(payload.version || ""),
    status: "draft",
    catalogStatus: "draft",
    isBenefit: !!payload.isBenefit,
    mainImageUrl: mainImageFrom(payload),
    imageBack: typeof payload.imageBack === "string" ? payload.imageBack : null,
    releaseId,
    releaseTitle: rel?.title,
    memberId: memberId || null,
    memberNameEn: mem?.nameEn || null,
    groupNameZh: rel?.groupNameZh,
  });
}

function mainImageFrom(payload: Record<string, unknown>) {
  return typeof payload.mainImageUrl === "string" ? payload.mainImageUrl : null;
}

async function onStatus(row: AnyRow, status: "published" | "draft" | "deprecated") {
  if (!isCrudTab(tab.value)) return;
  acting.value = true;
  const res = await setCatalogStatus(tab.value, row.id, status);
  acting.value = false;
  if (res.status !== 200) {
    const msg = errorMessage(res.body);
    pageNotice.value = msg;
    pageNoticeOk.value = false;
    message.error(msg);
    return;
  }
  pageNotice.value = `已更新为 ${status}`;
  pageNoticeOk.value = true;
  message.success(pageNotice.value);
  await refresh();
}

const emptyCopy = computed(() => {
  if (tab.value === "templates") return "暂无小卡。点「新建小卡」上传官方图鉴正/背图。";
  if (tab.value === "members") return "暂无成员";
  if (tab.value === "releases") return "暂无发行";
  return "暂无组合";
});

const selectedIds = computed(() => checkedRowKeys.value.map(String));

function confirmBatchDeprecate() {
  if (!isCrudTab(tab.value)) return;
  const targets = filteredRows.value.filter(
    (row) => selectedIds.value.includes(row.id) && rowStatus(row) !== "deprecated",
  );
  if (!targets.length) {
    message.warning("请先勾选未废弃的记录");
    return;
  }
  dialog.warning({
    title: "批量废弃",
    content: `将软废弃已选 ${targets.length} 条（不会硬删除）。确定继续？`,
    positiveText: "废弃",
    negativeText: "取消",
    onPositiveClick: () => onBatchDeprecate(targets),
  });
}

async function onBatchDeprecate(targets: AnyRow[]) {
  if (!isCrudTab(tab.value)) return;
  acting.value = true;
  let ok = 0;
  let fail = 0;
  let lastError = "";
  for (const row of targets) {
    const res = await setCatalogStatus(crudTab.value, row.id, "deprecated");
    if (res.status === 200) {
      ok += 1;
    } else {
      fail += 1;
      lastError = errorMessage(res.body);
    }
  }
  acting.value = false;
  checkedRowKeys.value = [];
  if (fail) {
    const msg = lastError || `有 ${fail} 条废弃失败`;
    pageNotice.value = ok ? `已废弃 ${ok} 条，失败 ${fail} 条` : msg;
    pageNoticeOk.value = false;
    message.error(pageNotice.value);
  } else {
    pageNotice.value = `已废弃 ${ok} 条`;
    pageNoticeOk.value = true;
    message.success(pageNotice.value);
  }
  await refresh();
}

function hardDeleteCopy(row: AnyRow) {
  const name = cardTitle(row) || row.id;
  if (tab.value === "templates") {
    return `将永久删除小卡模板「${name}」，不可恢复。这与「废弃」不同：废弃只从 C 端隐藏，删除会从数据库移除该模板（心愿单会一并去掉）。若已有用户收藏，接口会拒绝删除。`;
  }
  const kind = tab.value === "groups" ? "组合" : tab.value === "members" ? "成员" : "发行";
  return `将永久删除${kind}「${name}」，不可恢复。这与「废弃」不同。仅当没有子数据/引用时才能删除；已发布请先废弃。`;
}

function confirmHardDelete(row: AnyRow) {
  dialog.warning({
    title: "永久删除（不可恢复）",
    content: hardDeleteCopy(row),
    positiveText: "永久删除",
    negativeText: "取消",
    closable: true,
    maskClosable: false,
    positiveButtonProps: { type: "error" },
    onPositiveClick: () => onHardDelete(row),
  });
}

function confirmBatchHardDelete() {
  const ids = selectedIds.value.filter(Boolean);
  if (!ids.length) {
    message.warning("请先勾选要硬删的小卡模板");
    return;
  }
  dialog.warning({
    title: "批量永久删除（不可恢复）",
    content: `将永久删除已选的 ${ids.length} 张小卡模板，不可恢复。这与「废弃」不同：废弃只从 C 端隐藏。已被用户收藏的条目会跳过并显示错误。`,
    positiveText: "永久删除",
    negativeText: "取消",
    closable: true,
    maskClosable: false,
    positiveButtonProps: { type: "error" },
    onPositiveClick: () => onBatchHardDelete(ids),
  });
}

async function onHardDelete(row: AnyRow) {
  if (!isCrudTab(tab.value)) return;
  acting.value = true;
  const res = await deleteCatalog(tab.value, row.id);
  acting.value = false;
  if (res.status !== 200) {
    const msg = errorMessage(res.body);
    pageNotice.value = msg;
    pageNoticeOk.value = false;
    message.error(msg);
    return;
  }
  checkedRowKeys.value = checkedRowKeys.value.filter((k) => String(k) !== row.id);
  pageNotice.value = "已永久删除";
  pageNoticeOk.value = true;
  message.success(pageNotice.value);
  await refresh();
}

async function onBatchHardDelete(ids: string[]) {
  acting.value = true;
  const res = await hardDeleteTemplates(ids);
  acting.value = false;
  if (res.status !== 200) {
    const msg = errorMessage(res.body);
    pageNotice.value = msg;
    pageNoticeOk.value = false;
    message.error(msg);
    return;
  }
  const deleted = res.body.deleted || [];
  const failed = res.body.failed || [];
  checkedRowKeys.value = checkedRowKeys.value.filter((k) => !deleted.includes(String(k)));
  if (deleted.length && !failed.length) {
    pageNotice.value = `已永久删除 ${deleted.length} 张模板`;
    pageNoticeOk.value = true;
    message.success(pageNotice.value);
  } else if (deleted.length) {
    pageNotice.value = `已永久删除 ${deleted.length} 张；${failed.length} 张未删除：${failed[0]?.message || "失败"}`;
    pageNoticeOk.value = false;
    message.warning(pageNotice.value);
  } else {
    pageNotice.value = failed[0]?.message || "没有删除任何模板";
    pageNoticeOk.value = false;
    message.error(pageNotice.value);
  }
  await refresh();
}

function toggleChecked(id: string, checked: boolean) {
  if (checked) {
    if (!checkedRowKeys.value.includes(id)) checkedRowKeys.value = [...checkedRowKeys.value, id];
    return;
  }
  checkedRowKeys.value = checkedRowKeys.value.filter((k) => String(k) !== id);
}

watch(tab, () => {
  formShow.value = false;
  editing.value = null;
  pageNotice.value = "";
  checkedRowKeys.value = [];
  message.destroyAll();
});

watch(
  () => route.params.tab,
  (raw) => {
    const next = parseCatalogTab(raw);
    if (String(raw || "") !== next) {
      void router.replace({ name: "catalog", params: { tab: next } });
    }
  },
  { immediate: true },
);

watch(
  () => [tab.value, filterQ.value, filterStatus.value, filterGroupId.value, filterReleaseId.value] as const,
  () => {
    keywordDraft.value = filterQ.value;
    void refresh();
  },
  { immediate: true },
);

watch(
  () => [itemCount.value, page.value, pageSize.value] as const,
  ([count, current, size]) => {
    const last = maxPage(count, size);
    if (current > last) setQuery({ page: last });
  },
);

onMounted(() => {
  keywordDraft.value = filterQ.value;
});
</script>

<template>
  <PageHeader :title="headings[tab].title" :hint="headings[tab].hint" :crumbs="[{ label: '图鉴' }, { label: headings[tab].title.replace('图鉴 · ', '') }]" />
  <n-spin :show="loading">
    <n-card :bordered="false" class="ops-card">
      <n-tabs class="catalog-tabs" :value="tab" type="line" @update:value="onTab">
        <n-tab-pane v-for="item in CATALOG_TABS" :key="item.id" :name="item.id" :tab="item.label" />
      </n-tabs>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else-if="isImport">
        <CatalogImportView />
      </template>

      <template v-else-if="isBenefits">
        <CatalogBenefitsView :releases="bundle.releases" :groups="bundle.groups" />
      </template>

      <template v-else-if="isCompleteness">
        <CatalogCompletenessView />
      </template>

      <template v-else>
        <n-alert v-if="pageNotice" :type="pageNoticeOk ? 'success' : 'error'" :show-icon="false" class="block">{{ pageNotice }}</n-alert>
        <n-alert
          v-if="tab === 'templates'"
          type="info"
          :show-icon="false"
          class="block"
        >
          官方图鉴小卡在此维护：点「新建小卡」上传正面（发布必填）和卡背（可选）。也可点行内「维护」改已有卡。行内「删除」/「批量硬删」会永久移除记录，与「废弃」（仅 C 端隐藏）不同。
        </n-alert>
        <n-alert
          v-if="tab === 'templates' && templatesCapped"
          type="warning"
          :show-icon="false"
          class="block"
        >
          结果已截断为 {{ TEMPLATE_CAP }} 条，请收窄筛选后再查。
        </n-alert>
        <AdminFilterBar
          :page="page"
          :page-size="pageSize"
          :item-count="itemCount"
          :searching="loading"
          @search="onSearch"
          @reset="onReset"
          @update:page="setQuery({ page: $event })"
          @update:page-size="setQuery({ pageSize: $event, page: 1 })"
        >
          <n-input
            v-model:value="keywordDraft"
            clearable
            placeholder="关键词"
            style="width: 200px"
            @keyup.enter="onSearch"
          />
          <n-select
            :value="filterStatus"
            :options="STATUS_OPTIONS"
            style="width: 140px"
            @update:value="setQuery({ status: $event || undefined, page: 1 })"
          />
          <n-select
            v-if="tab !== 'groups'"
            :value="filterGroupId"
            :options="groupOptions"
            filterable
            style="width: 200px"
            @update:value="setQuery({ groupId: $event || undefined, releaseId: undefined, page: 1 })"
          />
          <n-select
            v-if="tab === 'templates'"
            :value="filterReleaseId"
            :options="releaseOptions"
            filterable
            style="width: 220px"
            @update:value="setQuery({ releaseId: $event || undefined, page: 1 })"
          />
          <template #actions>
            <n-button type="error" :disabled="!selectedIds.length || acting" @click="confirmBatchDeprecate">
              批量废弃{{ selectedIds.length ? ` (${selectedIds.length})` : "" }}
            </n-button>
            <n-button
              v-if="tab === 'templates'"
              type="error"
              ghost
              :disabled="acting || !selectedIds.length"
              @click="confirmBatchHardDelete"
            >
              批量硬删{{ selectedIds.length ? ` (${selectedIds.length})` : "" }}
            </n-button>
            <n-button type="primary" @click="openCreate">{{ tab === "templates" ? "新建小卡" : "新建" }}</n-button>
          </template>
        </AdminFilterBar>

        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in rows" :key="row.id" size="small" class="entity-card">
            <div class="card-head">
              <div class="name-with-logo">
                <n-checkbox
                  v-if="tab === 'templates'"
                  :checked="selectedIds.includes(row.id)"
                  @update:checked="(v) => toggleChecked(row.id, !!v)"
                />
                <img v-if="cardThumb(row)" :class="tab === 'templates' ? 'tpl-thumb' : 'group-thumb'" :src="cardThumb(row)" alt="" />
                <span v-else-if="tab === 'groups'" class="group-letter" :style="{ background: cardLetter(row).color }">{{ cardLetter(row).text }}</span>
                <n-button text type="primary" @click="openEdit(row)">{{ cardTitle(row) }}</n-button>
              </div>
              <n-tag size="small" :type="rowStatus(row) === 'published' ? 'success' : rowStatus(row) === 'deprecated' ? 'error' : 'default'" :bordered="false">
                {{ statusLabel(rowStatus(row)) }}
              </n-tag>
            </div>
            <p class="card-meta">{{ cardMeta(row) }}</p>
            <n-space :size="6" :wrap="true">
              <n-button size="tiny" type="primary" @click="openEdit(row)">维护</n-button>
              <StatusActions :status="rowStatus(row)" :pending="acting" @act="(s) => onStatus(row, s)" />
              <n-button
                v-if="canHardDelete(row)"
                size="tiny"
                type="error"
                ghost
                :disabled="acting"
                @click="confirmHardDelete(row)"
              >
                删除
              </n-button>
            </n-space>
          </n-card>
          <AdminEmptyState v-if="!rows.length" :copy="emptyCopy">
            <n-button type="primary" @click="openCreate">{{ tab === "templates" ? "新建小卡" : "新建" }}</n-button>
          </AdminEmptyState>
        </div>

        <n-data-table
          v-else-if="rows.length"
          v-model:checked-row-keys="checkedRowKeys"
          :columns="columns"
          :data="rows"
          :pagination="false"
          striped
          :scroll-x="tab === 'templates' ? 1180 : 900"
          :row-key="(row: AnyRow) => row.id"
        />
        <AdminEmptyState v-else :copy="emptyCopy">
          <n-button type="primary" @click="openCreate">{{ tab === "templates" ? "新建小卡" : "新建" }}</n-button>
        </AdminEmptyState>
      </template>
    </n-card>
  </n-spin>

  <CatalogFormModal
    v-if="isCrudTab(tab)"
    v-model:show="formShow"
    :tab="crudTab"
    :editing="editing"
    :groups="bundle.groups"
    :members="bundle.members"
    :releases="bundle.releases"
    :default-release-id="filterReleaseId"
    :submitting="acting"
    @save="onSave"
  />
</template>

<style scoped>
.ops-card {
  overflow: visible;
}

.catalog-tabs {
  margin-bottom: 8px;
}

.catalog-tabs :deep(.n-tab-pane) {
  display: none;
}

.block {
  margin: 12px 0;
}

.muted {
  color: var(--color-text-secondary);
  margin: 0;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entity-card :deep(.n-card__content) {
  padding: 12px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.card-meta {
  margin: 0 0 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tpl-thumb,
.group-thumb {
  width: 40px;
  height: 56px;
  object-fit: cover;
  border-radius: 4px;
  background: #eee;
  display: block;
}

.group-thumb {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.name-with-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-letter {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>

<style>
.tpl-thumb,
.group-thumb {
  width: 40px;
  height: 56px;
  object-fit: cover;
  border-radius: 4px;
  background: #eee;
  display: block;
}
.group-thumb {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
</style>
