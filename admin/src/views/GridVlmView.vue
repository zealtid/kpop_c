<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import {
  NAlert,
  NCard,
  NDataTable,
  NDatePicker,
  NGrid,
  NGridItem,
  NInput,
  NSelect,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import AdminFilterBar from "../components/AdminFilterBar.vue";
import PageHeader from "../components/PageHeader.vue";
import { maxPage, parsePage, parsePageSize, parseQueryText, patchListQuery } from "../listQuery";
import {
  defaultStatsRange,
  emptyDayStats,
  formatCallTime,
  getGridVlmStats,
  listGridVlmCalls,
  reasonLabel,
  shanghaiYmd,
  successRate,
  type GridVlmCall,
  type GridVlmDayStats,
} from "../gridVlm/api";
import { useNarrow } from "../narrow";

const route = useRoute();
const router = useRouter();
const { isNarrow } = useNarrow();

const loading = ref(true);
const deny = ref("");
const calls = ref<GridVlmCall[]>([]);
const total = ref(0);
const todayStats = ref<GridVlmDayStats>(emptyDayStats());
const weekStats = ref<GridVlmDayStats>(emptyDayStats());
const userDraft = ref("");

const defaults = defaultStatsRange();
const page = computed(() => parsePage(route.query.page));
const pageSize = computed(() => parsePageSize(route.query.pageSize));
const from = computed(() => parseQueryText(route.query.from).trim() || defaults.from);
const to = computed(() => parseQueryText(route.query.to).trim() || defaults.to);
const okFilter = computed(() => parseQueryText(route.query.ok).trim());
const reasonFilter = computed(() => parseQueryText(route.query.reason).trim());
const userId = computed(() => parseQueryText(route.query.userId).trim());
const dateRange = computed<[string, string]>(() => [from.value, to.value]);

const okOptions = [
  { label: "全部结果", value: "" },
  { label: "成功", value: "true" },
  { label: "失败", value: "false" },
];

const reasonOptions = [
  { label: "全部原因", value: "" },
  { label: "超时", value: "timeout" },
  { label: "识别失败", value: "vlm_fail" },
  { label: "未配置", value: "vlm_unconfigured" },
  { label: "未检出", value: "no_cards" },
  { label: "日限", value: "quota" },
];

function setQuery(patch: Record<string, string | number | undefined | null>) {
  void patchListQuery(router, route.query, patch);
}

function onDateRange(value: [string, string] | null) {
  if (!value) {
    setQuery({ from: undefined, to: undefined, page: 1 });
    return;
  }
  setQuery({ from: value[0], to: value[1], page: 1 });
}

function onOk(value: string) {
  setQuery({ ok: value || undefined, page: 1 });
}

function onReason(value: string) {
  setQuery({ reason: value || undefined, page: 1 });
}

function onSearch() {
  setQuery({ userId: userDraft.value.trim() || undefined, page: 1 });
}

function onReset() {
  userDraft.value = "";
  setQuery({
    from: undefined,
    to: undefined,
    ok: undefined,
    reason: undefined,
    userId: undefined,
    page: 1,
    pageSize: undefined,
  });
}

function resultTag(row: GridVlmCall) {
  return h(
    NTag,
    { size: "small", type: row.ok ? "success" : "warning", bordered: false },
    { default: () => reasonLabel(row.reason, row.ok) },
  );
}

const columns = computed<DataTableColumns<GridVlmCall>>(() => [
  { title: "时间", key: "createdAt", width: 168, render: (row) => formatCallTime(row.createdAt) },
  {
    title: "用户",
    key: "userId",
    minWidth: 140,
    ellipsis: { tooltip: true },
    render: (row) => row.userId || "—",
  },
  { title: "结果", key: "ok", width: 110, render: (row) => resultTag(row) },
  { title: "检出", key: "detectedCount", width: 72, render: (row) => String(row.detectedCount) },
  { title: "耗时", key: "latencyMs", width: 88, render: (row) => `${row.latencyMs} ms` },
  {
    title: "模型",
    key: "model",
    minWidth: 160,
    ellipsis: { tooltip: true },
    render: (row) => row.model || row.provider || "—",
  },
]);

const summaryCards = computed(() => [
  {
    title: "今日",
    stats: todayStats.value,
  },
  {
    title: "近 7 日",
    stats: weekStats.value,
  },
]);

async function refresh() {
  loading.value = true;
  deny.value = "";
  const weekRange = defaultStatsRange();
  const [statsRes, listRes] = await Promise.all([
    getGridVlmStats(weekRange),
    listGridVlmCalls({
      from: from.value,
      to: to.value,
      ok: okFilter.value || undefined,
      reason: reasonFilter.value || undefined,
      userId: userId.value || undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    }),
  ]);
  loading.value = false;
  if (!statsRes.ok) {
    deny.value = statsRes.message;
    todayStats.value = emptyDayStats();
    weekStats.value = emptyDayStats();
  } else {
    const today = shanghaiYmd();
    todayStats.value = statsRes.days.find((row) => row.day === today) || emptyDayStats();
    weekStats.value = statsRes.summary || emptyDayStats();
  }
  if (!listRes.ok) {
    deny.value = deny.value || listRes.message;
    calls.value = [];
    total.value = 0;
    return;
  }
  calls.value = listRes.calls;
  total.value = listRes.total;
  const last = maxPage(listRes.total, pageSize.value);
  if (page.value > last) {
    setQuery({ page: last });
  }
}

watch(
  () =>
    [
      route.query.from,
      route.query.to,
      route.query.ok,
      route.query.reason,
      route.query.userId,
      route.query.page,
      route.query.pageSize,
    ] as const,
  () => {
    userDraft.value = parseQueryText(route.query.userId);
    void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <PageHeader
    title="宫格识别"
    hint="豆包视觉检测的调用次数与结果记录。不替代每日配额，不含原图、密钥或方舟原文。"
    :crumbs="[{ label: '宫格识别' }]"
  />
  <n-spin :show="loading">
    <n-grid :cols="isNarrow ? 1 : 2" :x-gap="12" :y-gap="12" class="summary">
      <n-grid-item v-for="block in summaryCards" :key="block.title">
        <n-card size="small" :bordered="false" class="ops-card">
          <p class="block-title">{{ block.title }}</p>
          <div class="metrics">
            <div>
              <p class="metric-label">调用次数</p>
              <p class="metric-value">{{ block.stats.calls }}</p>
            </div>
            <div>
              <p class="metric-label">成功率</p>
              <p class="metric-value">{{ successRate(block.stats.ok, block.stats.calls) }}</p>
            </div>
            <div>
              <p class="metric-label">平均耗时</p>
              <p class="metric-value">{{ block.stats.calls ? `${block.stats.avgLatencyMs} ms` : "—" }}</p>
            </div>
            <div>
              <p class="metric-label">检出总张数</p>
              <p class="metric-value">{{ block.stats.sumDetected }}</p>
            </div>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-card :bordered="false" class="ops-card">
      <AdminFilterBar
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :searching="loading"
        :stacked="isNarrow"
        @search="onSearch"
        @reset="onReset"
        @update:page="setQuery({ page: $event })"
        @update:page-size="setQuery({ pageSize: $event, page: 1 })"
      >
        <n-date-picker
          :formatted-value="dateRange"
          type="daterange"
          value-format="yyyy-MM-dd"
          clearable
          style="width: 260px"
          @update:formatted-value="onDateRange"
        />
        <n-select
          :value="okFilter"
          :options="okOptions"
          style="width: 128px"
          @update:value="onOk"
        />
        <n-select
          :value="reasonFilter"
          :options="reasonOptions"
          style="width: 140px"
          @update:value="onReason"
        />
        <n-input
          v-model:value="userDraft"
          clearable
          placeholder="用户 ID"
          style="width: 220px"
          @keyup.enter="onSearch"
        />
      </AdminFilterBar>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else>
        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in calls" :key="row.id" size="small" class="call-card">
            <div class="card-head">
              <span class="user">{{ row.userId || "—" }}</span>
              <n-tag size="small" :type="row.ok ? 'success' : 'warning'" :bordered="false">
                {{ reasonLabel(row.reason, row.ok) }}
              </n-tag>
            </div>
            <p class="card-meta">{{ formatCallTime(row.createdAt) }}</p>
            <p class="card-meta">
              检出 {{ row.detectedCount }} · {{ row.latencyMs }} ms · {{ row.model || row.provider || "—" }}
            </p>
          </n-card>
          <p v-if="!calls.length" class="muted">暂无调用记录</p>
        </div>

        <n-data-table
          v-else-if="calls.length"
          :columns="columns"
          :data="calls"
          :pagination="false"
          striped
          :scroll-x="760"
          :row-key="(row: GridVlmCall) => row.id"
        />
        <p v-else class="muted empty">暂无调用记录</p>
      </template>
    </n-card>
  </n-spin>
</template>

<style scoped>
.summary {
  margin-bottom: 12px;
}

.ops-card {
  overflow: visible;
}

.block-title {
  margin: 0 0 10px;
  font-weight: 650;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.metric-label {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.metric-value {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.block {
  margin-bottom: 12px;
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

.call-card :deep(.n-card__content) {
  padding: 12px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.user {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.card-meta {
  margin: 0 0 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.empty {
  margin-top: 12px;
}
</style>
