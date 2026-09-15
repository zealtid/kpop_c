<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import {
  NAlert,
  NAvatar,
  NCard,
  NDataTable,
  NInput,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AdminFilterBar from "../components/AdminFilterBar.vue";
import PageHeader from "../components/PageHeader.vue";
import { mediaUrl } from "../api";
import { maxPage, parsePage, parsePageSize, parseQueryText, patchListQuery } from "../listQuery";
import { followLabel, formatUserTime, listUsers, type AdminUser } from "../users/api";
import { useNarrow } from "../narrow";

const route = useRoute();
const router = useRouter();
const { isNarrow } = useNarrow();

const loading = ref(true);
const deny = ref("");
const users = ref<AdminUser[]>([]);
const total = ref(0);
const keywordDraft = ref("");

const page = computed(() => parsePage(route.query.page));
const pageSize = computed(() => parsePageSize(route.query.pageSize));
const keyword = computed(() => parseQueryText(route.query.q).trim());

function setQuery(patch: Record<string, string | number | undefined | null>) {
  void patchListQuery(router, route.query, patch);
}

function onSearch() {
  setQuery({ q: keywordDraft.value.trim() || undefined, page: 1 });
}

function onReset() {
  keywordDraft.value = "";
  setQuery({ q: undefined, page: 1, pageSize: undefined });
}

function goDetail(row: AdminUser) {
  void router.push({ name: "user-detail", params: { id: row.id } });
}

function nicknameLink(row: AdminUser) {
  const name = row.nickname || "（无昵称）";
  return h(RouterLink, { to: { name: "user-detail", params: { id: row.id } } }, { default: () => name });
}

const columns = computed<DataTableColumns<AdminUser>>(() => [
  {
    title: "用户",
    key: "nickname",
    minWidth: 180,
    render: (row) =>
      h("div", { style: "display:flex;align-items:center;gap:8px" }, [
        h(NAvatar, {
          size: 32,
          round: true,
          src: mediaUrl(row.avatarUrl) || undefined,
        }, { default: () => (row.nickname || "?").slice(0, 1) }),
        nicknameLink(row),
      ]),
  },
  {
    title: "关注",
    key: "followedGroups",
    minWidth: 160,
    render: (row) => followLabel(row.followedGroups),
  },
  {
    title: "贡献积分",
    key: "contributionPoints",
    width: 100,
    render: (row) => String(row.contributionPoints ?? 0),
  },
  {
    title: "投稿",
    key: "submissionCount",
    width: 120,
    render: (row) =>
      `${row.submissionCount}（待审 ${row.pendingCount} / 通过 ${row.approvedCount}）`,
  },
  {
    title: "注册",
    key: "createdAt",
    width: 140,
    render: (row) => formatUserTime(row.createdAt),
  },
]);

async function refresh() {
  loading.value = true;
  deny.value = "";
  const result = await listUsers({
    q: keyword.value || undefined,
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
  });
  loading.value = false;
  if (!result.ok) {
    deny.value = result.message;
    users.value = [];
    total.value = 0;
    return;
  }
  users.value = result.users;
  total.value = result.total;
  const last = maxPage(result.total, pageSize.value);
  if (page.value > last) {
    setQuery({ page: last });
  }
}

watch(
  () => [route.query.q, route.query.page, route.query.pageSize] as const,
  () => {
    keywordDraft.value = parseQueryText(route.query.q);
    void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <PageHeader
    title="用户"
    hint="只读：现有用户资料、关注组合、投稿记录与贡献积分。积分仅在图鉴投稿首次审核通过时 +1；驳回与历史上线前已通过记录不计。"
    :crumbs="[{ label: '用户' }]"
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
        <n-input
          v-model:value="keywordDraft"
          clearable
          placeholder="昵称或用户 ID"
          style="width: 240px"
          @keyup.enter="onSearch"
        />
      </AdminFilterBar>

      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>

      <template v-else>
        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in users" :key="row.id" size="small" class="user-card" @click="goDetail(row)">
            <div class="card-head">
              <n-avatar round size="small" :src="mediaUrl(row.avatarUrl) || undefined">
                {{ (row.nickname || "?").slice(0, 1) }}
              </n-avatar>
              <RouterLink class="body-link" :to="{ name: 'user-detail', params: { id: row.id } }">
                {{ row.nickname || "（无昵称）" }}
              </RouterLink>
              <n-tag size="small" :bordered="false">{{ row.contributionPoints }} 分</n-tag>
            </div>
            <p class="card-meta">关注 {{ followLabel(row.followedGroups) }}</p>
            <p class="card-meta">投稿 {{ row.submissionCount }} · {{ formatUserTime(row.createdAt) }}</p>
          </n-card>
          <p v-if="!users.length" class="muted">暂无用户</p>
        </div>

        <n-data-table
          v-else-if="users.length"
          :columns="columns"
          :data="users"
          :pagination="false"
          striped
          :scroll-x="720"
          :row-key="(row: AdminUser) => row.id"
          :row-props="(row: AdminUser) => ({ style: 'cursor: pointer', onClick: () => goDetail(row) })"
        />
        <p v-else class="muted empty">暂无用户</p>
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

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.body-link {
  color: var(--color-brand);
  text-decoration: none;
  font-weight: 600;
  flex: 1;
  overflow-wrap: anywhere;
}

.card-meta {
  margin: 0 0 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.empty {
  margin-top: 12px;
}
</style>
