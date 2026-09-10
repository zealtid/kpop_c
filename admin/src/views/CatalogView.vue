<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NSpace,
  NSpin,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { errorMessage } from "../api";
import { loadCatalog, saveCatalog, setCatalogStatus } from "../catalog/api";
import {
  CATALOG_TABS,
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
import CatalogFormModal from "../components/catalog/CatalogFormModal.vue";
import StatusActions from "../components/catalog/StatusActions.vue";
import { useNarrow } from "../narrow";

type AnyRow = Group | Member | Release | Template;

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { isNarrow } = useNarrow();

const tab = computed(() => parseCatalogTab(route.params.tab));
const crudTab = computed<CatalogCrudTab>(() => (isCrudTab(tab.value) ? tab.value : "groups"));
const isLater = computed(() => !isCrudTab(tab.value));

const loading = ref(true);
const acting = ref(false);
const deny = ref("");
const bundle = ref<CatalogBundle>({ groups: [], members: [], releases: [], templates: [] });
const formShow = ref(false);
const editing = ref<AnyRow | null>(null);

const headings: Record<CatalogTab, { title: string; hint: string }> = {
  groups: { title: "图鉴 · 组合", hint: "ArtistGroup → idol_groups。新建为草稿；发布后才出现在小程序图鉴。" },
  members: { title: "图鉴 · 成员", hint: "Member。草稿成员不出现在小程序组合页。" },
  releases: { title: "图鉴 · 发行", hint: "Release。演唱会特典用 kind=concert_md，没有独立 Event 表。" },
  templates: { title: "图鉴 · 小卡模板", hint: "PhotocardTemplate。无主图不能发布。去重键 = slug:发行标题:成员:version。" },
  completeness: { title: "图鉴 · 完整度", hint: "切片后续" },
  import: { title: "图鉴 · 导入", hint: "切片后续" },
  benefits: { title: "图鉴 · 特典对照", hint: "切片后续" },
};

const laterHint: Record<string, string> = {
  completeness: "完整度看板在后续切片迁移。",
  import: "批量导入在后续切片迁移。",
  benefits: "特典对照在后续切片迁移（B2）。",
};

const rows = computed<AnyRow[]>(() => {
  const data = bundle.value;
  if (tab.value === "members") return data.members;
  if (tab.value === "releases") return data.releases;
  if (tab.value === "templates") return data.templates;
  return data.groups;
});

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
        width: 72,
        render: (row) => ((row as Template).mainImageUrl ? "有图" : "无主图"),
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

async function refresh() {
  loading.value = true;
  deny.value = "";
  const result = await loadCatalog();
  loading.value = false;
  if (!result.ok) {
    deny.value = result.message;
    bundle.value = { groups: [], members: [], releases: [], templates: [] };
    return;
  }
  bundle.value = result.data;
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
  acting.value = true;
  const res = await saveCatalog(tab.value, editing.value?.id || null, payload);
  acting.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body));
    return;
  }
  message.success(editing.value ? "已保存" : "已创建为草稿");
  formShow.value = false;
  editing.value = null;
  await refresh();
}

async function onStatus(row: AnyRow, status: "published" | "draft" | "deprecated") {
  if (!isCrudTab(tab.value)) return;
  acting.value = true;
  const res = await setCatalogStatus(tab.value, row.id, status);
  acting.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body));
    return;
  }
  message.success(`已更新为 ${status}`);
  await refresh();
}

watch(tab, () => {
  formShow.value = false;
  editing.value = null;
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

onMounted(() => {
  void refresh();
});
</script>

<template>
  <n-spin :show="loading">
    <n-card :title="headings[tab].title">
      <nav class="subnav" aria-label="图鉴子导航">
        <RouterLink
          v-for="item in CATALOG_TABS"
          :key="item.id"
          class="subnav-item"
          :class="{ active: tab === item.id }"
          :to="{ name: 'catalog', params: { tab: item.id } }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else-if="isLater">
        <n-alert type="warning" :show-icon="false">{{ headings[tab].hint }}</n-alert>
        <p class="muted">{{ laterHint[tab] }}</p>
      </template>

      <template v-else>
        <p class="muted">{{ headings[tab].hint }}</p>
        <n-space class="toolbar">
          <n-button type="primary" @click="openCreate">新建</n-button>
        </n-space>

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
.subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.subnav-item {
  text-decoration: none;
  color: var(--color-text-primary);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-bg-page);
  font-size: 13px;
}

.subnav-item.active,
.subnav-item:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}

.toolbar {
  margin-bottom: 12px;
}

.block {
  margin-bottom: 12px;
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
