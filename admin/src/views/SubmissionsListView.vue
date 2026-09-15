<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NCard,
  NDataTable,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import AuthMediaImg from "../components/AuthMediaImg.vue";
import { loadCatalogLookups } from "../catalog/api";
import { listSubmissions, type Submission } from "../submissions/api";
import { useNarrow } from "../narrow";
import { parseQueryText, patchListQuery } from "../listQuery";

const route = useRoute();
const router = useRouter();
const { isNarrow } = useNarrow();

const loading = ref(true);
const deny = ref("");
const rows = ref<Submission[]>([]);
const groups = ref<{ label: string; value: string }[]>([]);

const statusFilter = computed(() => parseQueryText(route.query.status));
const groupId = computed(() => parseQueryText(route.query.groupId));

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "待审", value: "pending_review" },
  { label: "已通过", value: "approved" },
  { label: "已驳回", value: "rejected" },
];

function statusTag(status: string) {
  const type = status === "pending_review" ? "warning" : status === "approved" ? "success" : "error";
  const label = status === "pending_review" ? "待审" : status === "approved" ? "通过" : "驳回";
  return h(NTag, { size: "small", type }, { default: () => label });
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
  { title: "组合", key: "groupNameZh", width: 120, render: (row) => row.groupNameZh || "" },
  { title: "专辑", key: "releaseTitle", render: (row) => row.releaseTitle || "" },
  { title: "状态", key: "status", width: 88, render: (row) => statusTag(row.status) },
  { title: "来源", key: "source", width: 120, render: (row) => (row.source === "from_custom_card" ? "私人卡" : "直投") },
]);

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

function onStatus(value: string) {
  patchListQuery(router, route.query, { status: value || undefined, page: undefined });
}
function onGroup(value: string) {
  patchListQuery(router, route.query, { groupId: value || undefined, page: undefined });
}
</script>

<template>
  <PageHeader title="投稿审核" hint="待审优先。通过后创建或合并公开模板；驳回删除待审图。" />
  <n-alert v-if="deny" type="error" style="margin-bottom: 12px">{{ deny }}</n-alert>
  <n-space style="margin-bottom: 12px">
    <n-select :value="statusFilter" :options="statusOptions" style="min-width: 140px" @update:value="onStatus" />
    <n-select :value="groupId" :options="groups" style="min-width: 180px" @update:value="onGroup" />
  </n-space>
  <n-spin :show="loading">
    <n-data-table v-if="!isNarrow" :columns="columns" :data="rows" :bordered="false" />
    <div v-else class="cards">
      <n-card v-for="row in rows" :key="row.id" size="small" @click="$router.push({ name: 'submission-detail', params: { id: row.id } })">
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
    </div>
  </n-spin>
</template>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  color: var(--n-text-color-3);
  font-size: 13px;
  margin-top: 4px;
}
</style>
