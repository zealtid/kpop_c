<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NInput,
  NSelect,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import { errorMessage } from "../api";
import { loadAdminTemplates, loadCatalogLookups, saveCatalog, setCatalogStatus } from "../catalog/api";
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
const { isNarrow } = useNarrow();

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
  groups: { title: "图鉴 · 组合", hint: "ArtistGroup → idol_groups。新建为草稿；发布后才出现在小程序图鉴。" },
  members: { title: "图鉴 · 成员", hint: "Member。草稿成员不出现在小程序组合页。" },
  releases: { title: "图鉴 · 发行", hint: "Release。演唱会特典用 kind=concert_md，没有独立 Event 表。" },
  templates: { title: "图鉴 · 小卡模板", hint: "PhotocardTemplate。无主图不能发布。去重键 = slug:发行标题:成员:version。" },
  completeness: { title: "图鉴 · 完整度", hint: "按组合查看发行闸门与缺图/缺成员。" },
  import: { title: "图鉴 · 导入校验", hint: "校验 CSV / Markdown / JSON，通过后再写入。" },
  benefits: { title: "图鉴 · 特典对照", hint: "校验通路词典与卡槽，只写入 confirmed 行。" },
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

function actionsCell(row: AnyRow) {
  return h(StatusActions, {
    status: rowStatus(row),
    pending: acting.value,
    onAct: (status: "published" | "draft" | "deprecated") => void onStatus(row, status),
  });
}

const columns = computed<DataTableColumns<AnyRow>>(() => {
  if (tab.value === "members") {
    return [
      { title: "英文", key: "nameEn", render: (row) => nameButton((row as Member).nameEn, row) },
      { title: "中文", key: "nameZh", render: (row) => (row as Member).nameZh || "" },
      { title: "组合", key: "groupNameZh", render: (row) => (row as Member).groupNameZh || "" },
      { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
      { title: "", key: "actions", width: 220, render: (row) => actionsCell(row) },
    ];
  }
  if (tab.value === "releases") {
    return [
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
      { title: "", key: "actions", width: 220, render: (row) => actionsCell(row) },
    ];
  }
  if (tab.value === "templates") {
    return [
      { title: "名称", key: "name", render: (row) => nameButton((row as Template).name, row) },
      { title: "发行", key: "releaseTitle", render: (row) => (row as Template).releaseTitle || "" },
      { title: "成员", key: "memberNameEn", render: (row) => (row as Template).memberNameEn || "group" },
      { title: "版本", key: "version", width: 88, render: (row) => (row as Template).version },
      { title: "", key: "isBenefit", width: 56, render: (row) => ((row as Template).isBenefit ? "特典" : "") },
      {
        title: "图",
        key: "mainImageUrl",
        width: 88,
        render: (row) =>
          (row as Template).mainImageUrl
            ? "有图"
            : h("span", { style: "color: var(--color-warning)" }, "无主图"),
      },
      { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
      { title: "", key: "actions", width: 220, render: (row) => actionsCell(row) },
    ];
  }
  return [
    { title: "名称", key: "nameZh", render: (row) => nameButton((row as Group).nameZh, row) },
    { title: "slug", key: "slug", render: (row) => (row as Group).slug },
    { title: "状态", key: "status", width: 88, render: (row) => statusTag(rowStatus(row)) },
    { title: "", key: "actions", width: 220, render: (row) => actionsCell(row) },
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

async function onSave(payload: Record<string, unknown>) {
  if (!isCrudTab(tab.value)) return;
  const editingId = editing.value?.id || null;
  acting.value = true;
  const res = await saveCatalog(tab.value, editingId, payload);
  acting.value = false;
  if (res.status !== 200) {
    const msg = errorMessage(res.body);
    pageNotice.value = msg;
    pageNoticeOk.value = false;
    message.error(msg);
    return;
  }
  pageNotice.value = editingId ? "已保存" : "已创建为草稿";
  pageNoticeOk.value = true;
  formShow.value = false;
  editing.value = null;
  await nextTick();
  message.success(pageNotice.value);
  await refresh();
  formShow.value = false;
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

watch(tab, () => {
  formShow.value = false;
  editing.value = null;
  pageNotice.value = "";
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
    <n-card :bordered="false">
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
            <n-button type="primary" @click="openCreate">新建</n-button>
          </template>
        </AdminFilterBar>

        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in rows" :key="row.id" size="small" class="entity-card">
            <div class="card-head">
              <n-button text type="primary" @click="openEdit(row)">{{ cardTitle(row) }}</n-button>
              <n-tag size="small" :type="rowStatus(row) === 'published' ? 'success' : rowStatus(row) === 'deprecated' ? 'error' : 'default'" :bordered="false">
                {{ statusLabel(rowStatus(row)) }}
              </n-tag>
            </div>
            <p class="card-meta">{{ cardMeta(row) }}</p>
            <StatusActions :status="rowStatus(row)" :pending="acting" @act="(s) => onStatus(row, s)" />
          </n-card>
          <p v-if="!rows.length" class="muted">暂无数据</p>
        </div>

        <n-data-table
          v-else
          :columns="columns"
          :data="rows"
          :pagination="false"
          striped
          :scroll-x="tab === 'templates' ? 960 : 720"
          :row-key="(row: AnyRow) => row.id"
        />
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
    :submitting="acting"
    @save="onSave"
  />
</template>

<style scoped>
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
</style>
