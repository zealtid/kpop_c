<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { NAlert, NButton, NCard, NDataTable, NSpin, NTag, type DataTableColumns } from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
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

const statusFilter = computed(() => parseTicketStatusFilter(route.query.status));

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

async function refresh() {
  loading.value = true;
  deny.value = "";
  const result = await listTickets(statusFilter.value);
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
  () => route.query.status,
  (raw) => {
    if (raw && !parseTicketStatusFilter(raw)) {
      void router.replace({ name: "tickets" });
      return;
    }
    void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <n-spin :show="loading">
    <n-card title="反馈 / 工单">
      <p class="muted">
        消费小程序空搜（C03）提交的文字缺卡反馈。进度<strong>不</strong>回写 C 端。关联模板仅为草稿，无申请入库。
      </p>

      <nav class="subnav" aria-label="工单状态筛选">
        <RouterLink
          v-for="item in TICKET_FILTERS"
          :key="item.id || 'all'"
          class="subnav-item"
          :class="{ active: statusFilter === item.id }"
          :to="item.id ? { name: 'tickets', query: { status: item.id } } : { name: 'tickets' }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else>
        <p class="stats">{{ total }} 条</p>

        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in tickets" :key="row.id" size="small" class="ticket-card">
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
            <n-button text type="primary" @click="$router.push({ name: 'ticket-detail', params: { id: row.id } })">
              查看详情
            </n-button>
          </n-card>
          <p v-if="!tickets.length" class="muted">暂无工单</p>
        </div>

        <n-data-table
          v-else-if="tickets.length"
          :columns="columns"
          :data="tickets"
          :pagination="false"
          :scroll-x="720"
          :row-key="(row: Ticket) => row.id"
        />
        <p v-else class="muted empty">暂无工单</p>
      </template>
    </n-card>
  </n-spin>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}

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

.stats {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin: 0 0 12px;
}

.block {
  margin-bottom: 12px;
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
