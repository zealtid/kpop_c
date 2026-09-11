<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NInput,
  NSelect,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AdminFilterBar from "../components/AdminFilterBar.vue";
import PageHeader from "../components/PageHeader.vue";
import { parsePage, parsePageSize, parseQueryText, patchListQuery } from "../listQuery";
import { listTickets } from "../tickets/api";
import {
  formatTicketTime,
  parseTicketStatusFilter,
  ticketSnippet,
  ticketStatusLabel,
  ticketStatusTagType,
  TICKET_FILTERS,
  type Ticket,
} from "../tickets/types";
import { useNarrow } from "../narrow";

const route = useRoute();
const router = useRouter();
const { isNarrow } = useNarrow();

const loading = ref(true);
const deny = ref("");
const tickets = ref<Ticket[]>([]);
const total = ref(0);
const keywordDraft = ref("");

const statusFilter = computed(() => parseTicketStatusFilter(route.query.status));
const page = computed(() => parsePage(route.query.page));
const pageSize = computed(() => parsePageSize(route.query.pageSize));
const keyword = computed(() => parseQueryText(route.query.q).trim());

const statusOptions = TICKET_FILTERS.map((item) => ({
  label: item.label,
  value: item.id,
}));

const displayed = computed(() => {
  const q = keyword.value.toLowerCase();
  if (!q) return tickets.value;
  return tickets.value.filter((row) => {
    const hay = `${row.user.nickname} ${row.body} ${row.linkedTemplate?.name || ""}`.toLowerCase();
    return hay.includes(q);
  });
});

function statusTag(status: string) {
  return h(
    NTag,
    { size: "small", type: ticketStatusTagType(status), bordered: false },
    { default: () => ticketStatusLabel(status) },
  );
}

function bodyLink(row: Ticket) {
  return h(
    RouterLink,
    { to: { name: "ticket-detail", params: { id: row.id } } },
    { default: () => ticketSnippet(row.body) || "（空）" },
  );
}

const columns = computed<DataTableColumns<Ticket>>(() => [
  { title: "提交", key: "createdAt", width: 140, render: (row) => formatTicketTime(row.createdAt) },
  { title: "用户", key: "user", width: 120, render: (row) => row.user.nickname },
  { title: "内容", key: "body", minWidth: 220, render: (row) => bodyLink(row) },
  { title: "状态", key: "status", width: 96, render: (row) => statusTag(row.status) },
  {
    title: "关联模板",
    key: "linkedTemplate",
    minWidth: 160,
    render: (row) => row.linkedTemplate?.name || row.linkedTemplate?.id || "—",
  },
]);

function setQuery(patch: Record<string, string | number | undefined | null>) {
  void patchListQuery(router, route.query, patch);
}

function onStatus(value: string) {
  setQuery({ status: value || undefined, page: 1 });
}

function onSearch() {
  setQuery({ q: keywordDraft.value.trim() || undefined, page: page.value });
}

function onReset() {
  keywordDraft.value = "";
  setQuery({ status: undefined, q: undefined, page: 1, pageSize: undefined });
}

function goDetail(row: Ticket) {
  void router.push({ name: "ticket-detail", params: { id: row.id } });
}

async function refresh() {
  loading.value = true;
  deny.value = "";
  const result = await listTickets({
    status: statusFilter.value || undefined,
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
  });
  loading.value = false;
  if (!result.ok) {
    deny.value = result.message;
    tickets.value = [];
    total.value = 0;
    return;
  }
  tickets.value = result.tickets;
  total.value = result.total;
}

watch(
  () => [route.query.status, route.query.page, route.query.pageSize, route.query.q] as const,
  ([rawStatus]) => {
    keywordDraft.value = parseQueryText(route.query.q);
    if (rawStatus && !parseTicketStatusFilter(rawStatus)) {
      void router.replace({ name: "tickets" });
      return;
    }
    void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <PageHeader
    title="反馈 / 工单"
    hint="消费小程序空搜提交的文字缺卡反馈。进度不回写 C 端。关联模板仅为草稿，无申请入库。关键词仅筛选当前页。"
    :crumbs="[{ label: '反馈 / 工单' }]"
  />
  <n-spin :show="loading">
    <n-card :bordered="false">
      <AdminFilterBar
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :searching="loading"
        @search="onSearch"
        @reset="onReset"
        @update:page="setQuery({ page: $event })"
        @update:page-size="setQuery({ pageSize: $event, page: 1 })"
      >
        <n-select
          :value="statusFilter"
          :options="statusOptions"
          style="width: 160px"
          @update:value="onStatus"
        />
        <n-input
          v-model:value="keywordDraft"
          clearable
          placeholder="本页：用户 / 内容 / 模板"
          style="width: 240px"
          @keyup.enter="onSearch"
        />
      </AdminFilterBar>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else>
        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in displayed" :key="row.id" size="small" class="ticket-card" @click="goDetail(row)">
            <div class="card-head">
              <RouterLink class="body-link" :to="{ name: 'ticket-detail', params: { id: row.id } }">
                {{ ticketSnippet(row.body) || "（空）" }}
              </RouterLink>
              <n-tag size="small" :type="ticketStatusTagType(row.status)" :bordered="false">
                {{ ticketStatusLabel(row.status) }}
              </n-tag>
            </div>
            <p class="card-meta">{{ row.user.nickname }} · {{ formatTicketTime(row.createdAt) }}</p>
            <p class="card-meta">
              关联 {{ row.linkedTemplate?.name || row.linkedTemplate?.id || "—" }}
            </p>
            <n-button text type="primary" @click.stop="goDetail(row)">查看详情</n-button>
          </n-card>
          <p v-if="!displayed.length" class="muted">暂无工单</p>
        </div>

        <n-data-table
          v-else-if="displayed.length"
          :columns="columns"
          :data="displayed"
          :pagination="false"
          striped
          :scroll-x="720"
          :row-key="(row: Ticket) => row.id"
          :row-props="(row: Ticket) => ({ style: 'cursor: pointer', onClick: () => goDetail(row) })"
        />
        <p v-else class="muted empty">暂无工单</p>
      </template>
    </n-card>
  </n-spin>
</template>

<style scoped>
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

.ticket-card :deep(.n-card__content) {
  padding: 12px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.body-link {
  color: var(--color-brand);
  text-decoration: none;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.card-meta {
  margin: 0 0 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.empty {
  margin-top: 12px;
}
</style>
