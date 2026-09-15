<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NCard,
  NDataTable,
  NSelect,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AdminEmptyState from "../components/AdminEmptyState.vue";
import AdminFilterBar from "../components/AdminFilterBar.vue";
import AuthMediaImg from "../components/AuthMediaImg.vue";
import PageHeader from "../components/PageHeader.vue";
import { loadCatalogLookups } from "../catalog/api";
import { maxPage, parsePage, parsePageSize, parseQueryText, patchListQuery, slicePage } from "../listQuery";
import { listSubmissions, type Submission } from "../submissions/api";
import { useNarrow } from "../narrow";

const route = useRoute();
const router = useRouter();
const { isNarrow } = useNarrow();

const loading = ref(true);
const deny = ref("");
const rows = ref<Submission[]>([]);
const groups = ref<{ label: string; value: string }[]>([]);

const statusFilter = computed(() => parseQueryText(route.query.status));
const groupId = computed(() => parseQueryText(route.query.groupId));
const page = computed(() => parsePage(route.query.page));
const pageSize = computed(() => parsePageSize(route.query.pageSize));
const itemCount = computed(() => rows.value.length);
const pagedRows = computed(() => slicePage(rows.value, page.value, pageSize.value));

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "待审", value: "pending_review" },
  { label: "已通过", value: "approved" },
  { label: "已驳回", value: "rejected" },
];

function statusTag(status: string) {
  const type = status === "pending_review" ? "warning" : status === "approved" ? "success" : "error";
  const label = status === "pending_review" ? "待审" : status === "approved" ? "通过" : "驳回";
  return h(NTag, { size: "small", type, bordered: false }, { default: () => label });
}

const columns = computed<DataTableColumns<Submission>>(() => [
  {
    title: "图",
    key: "thumb",
    width: 56,
    render: (row) =>
      row.status === "pending_review"
        ? h(AuthMediaImg, {
            compact: true,
            adminMediaPath: `/admin/catalog-submissions/${row.id}/media/thumb`,
            srcPath: row.imageFrontThumbUrl || row.imageFrontUrl || row.imageFrontThumb || row.imageFront,
          })
        : "",
  },
  {
    title: "名称",
    key: "slotLabel",
    render: (row) =>
      h(RouterLink, { to: { name: "submission-detail", params: { id: row.id } } }, { default: () => row.slotLabel }),
  },
  {
    title: "用户",
    key: "userId",
    width: 120,
    render: (row) =>
      row.userId
        ? h(
            RouterLink,
            { to: { name: "user-detail", params: { id: row.userId } } },
            { default: () => row.userNickname || row.userId.slice(0, 8) },
          )
        : "",
  },
  { title: "组合", key: "groupNameZh", width: 120, render: (row) => row.groupNameZh || "" },
  { title: "专辑", key: "releaseTitle", render: (row) => row.releaseTitle || "" },
  { title: "状态", key: "status", width: 88, render: (row) => statusTag(row.status) },
  { title: "来源", key: "source", width: 120, render: (row) => (row.source === "from_custom_card" ? "私人卡" : "直投") },
]);

function setQuery(patch: Record<string, string | number | undefined | null>) {
  void patchListQuery(router, route.query, patch);
}

function onSearch() {
  setQuery({ page: 1 });
}

function onReset() {
  setQuery({ status: undefined, groupId: undefined, page: 1, pageSize: undefined });
}

function goDetail(row: Submission) {
  void router.push({ name: "submission-detail", params: { id: row.id } });
}

async function refresh() {
  loading.value = true;
  const lookups = await loadCatalogLookups();
  if (lookups.ok) {
    groups.value = [
      { label: "全部组合", value: "" },
      ...lookups.data.groups.map((g) => ({ label: `${g.nameZh} (${g.slug})`, value: g.id })),
    ];
  }
  const result = await listSubmissions({
    status: statusFilter.value || undefined,
    groupId: groupId.value || undefined,
  });
  if (!result.ok) {
    deny.value = result.message;
    rows.value = [];
  } else {
    deny.value = "";
    rows.value = result.submissions;
  }
  loading.value = false;
}

onMounted(refresh);
watch(() => [route.query.status, route.query.groupId], refresh);

watch(
  () => [itemCount.value, page.value, pageSize.value] as const,
  ([count, current, size]) => {
    const last = maxPage(count, size);
    if (current > last) setQuery({ page: last });
  },
);
</script>

<template>
  <PageHeader title="投稿审核" hint="待审优先。通过后创建或合并公开模板；驳回删除待审图。" />
  <n-spin :show="loading">
    <n-card :bordered="false" class="ops-card">
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
        <n-select
          :value="statusFilter"
          :options="statusOptions"
          style="width: 140px"
          @update:value="setQuery({ status: $event || undefined, page: 1 })"
        />
        <n-select
          :value="groupId"
          :options="groups"
          style="width: 180px"
          @update:value="setQuery({ groupId: $event || undefined, page: 1 })"
        />
      </AdminFilterBar>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else>
        <div v-if="isNarrow" class="cards">
          <n-card
            v-for="row in pagedRows"
            :key="row.id"
            size="small"
            class="entity-card"
            @click="goDetail(row)"
          >
            <div class="card-row">
              <AuthMediaImg
                v-if="row.status === 'pending_review'"
                compact
                :admin-media-path="`/admin/catalog-submissions/${row.id}/media/thumb`"
                :src-path="row.imageFrontThumbUrl || row.imageFrontUrl || row.imageFrontThumb || row.imageFront"
                alt=""
              />
              <div>
                <div class="card-title">{{ row.slotLabel }}</div>
                <div class="muted">{{ row.groupNameZh }} · {{ row.releaseTitle }}</div>
              </div>
            </div>
          </n-card>
          <AdminEmptyState v-if="!pagedRows.length" copy="暂无投稿" />
        </div>

        <n-data-table
          v-else-if="pagedRows.length"
          :columns="columns"
          :data="pagedRows"
          :pagination="false"
          striped
          :scroll-x="800"
          :row-key="(row: Submission) => row.id"
          :row-props="(row: Submission) => ({ style: 'cursor: pointer', onClick: () => goDetail(row) })"
        />
        <AdminEmptyState v-else copy="暂无投稿" />
      </template>
    </n-card>
  </n-spin>
</template>

<style scoped>
.ops-card {
  overflow: visible;
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

.card-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.card-title {
  font-weight: 600;
}

.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-top: 4px;
}
</style>
