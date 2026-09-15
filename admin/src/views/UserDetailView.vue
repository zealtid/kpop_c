<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NAvatar,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import { errorMessage, mediaUrl } from "../api";
import { followLabel, formatUserTime, getUser, type AdminUser } from "../users/api";
import { listSubmissions, type Submission } from "../submissions/api";
import { useNarrow } from "../narrow";

const route = useRoute();
const { isNarrow } = useNarrow();

const userId = computed(() => String(route.params.id || ""));
const loading = ref(true);
const deny = ref("");
const user = ref<AdminUser | null>(null);
const submissions = ref<Submission[]>([]);

function statusTag(status: string) {
  const type = status === "pending_review" ? "warning" : status === "approved" ? "success" : "error";
  const label = status === "pending_review" ? "待审" : status === "approved" ? "通过" : "驳回";
  return h(NTag, { size: "small", type, bordered: false }, { default: () => label });
}

const columns = computed<DataTableColumns<Submission>>(() => [
  {
    title: "名称",
    key: "slotLabel",
    minWidth: 140,
    render: (row) =>
      h(RouterLink, { to: { name: "submission-detail", params: { id: row.id } } }, { default: () => row.slotLabel }),
  },
  { title: "组合", key: "groupNameZh", width: 120, render: (row) => row.groupNameZh || "" },
  { title: "专辑", key: "releaseTitle", minWidth: 140, render: (row) => row.releaseTitle || "" },
  { title: "状态", key: "status", width: 88, render: (row) => statusTag(row.status) },
  {
    title: "积分",
    key: "pointsAwarded",
    width: 72,
    render: (row) => String(row.pointsAwarded ?? (row.status === "approved" ? "—" : 0)),
  },
  { title: "提交", key: "createdAt", width: 140, render: (row) => formatUserTime(row.createdAt) },
]);

async function refresh() {
  loading.value = true;
  deny.value = "";
  user.value = null;
  submissions.value = [];
  const res = await getUser(userId.value);
  if (res.status !== 200) {
    deny.value = errorMessage(res.body, "加载失败");
    loading.value = false;
    return;
  }
  user.value = res.body;
  const hist = await listSubmissions({ userId: userId.value });
  if (hist.ok) submissions.value = hist.submissions;
  loading.value = false;
}

onMounted(refresh);
watch(userId, refresh);
</script>

<template>
  <PageHeader
    title="用户详情"
    hint="只读资料与投稿/上传历史。贡献积分仅在审核通过时计入，驳回为 0。"
    :crumbs="[{ label: '用户', to: { name: 'users' } }, { label: user?.nickname || '详情' }]"
  />
  <n-spin :show="loading">
    <n-alert v-if="deny" type="error" :show-icon="false" style="margin-bottom: 12px">{{ deny }}</n-alert>
    <template v-else-if="user">
      <n-card :bordered="false" style="margin-bottom: 16px">
        <div class="profile">
          <n-avatar round :size="56" :src="mediaUrl(user.avatarUrl) || undefined">
            {{ (user.nickname || "?").slice(0, 1) }}
          </n-avatar>
          <div>
            <div class="name">{{ user.nickname || "（无昵称）" }}</div>
            <div class="muted">{{ user.id }}</div>
          </div>
        </div>
        <n-descriptions :column="isNarrow ? 1 : 3" label-placement="left" style="margin-top: 16px">
          <n-descriptions-item label="贡献积分">{{ user.contributionPoints }}</n-descriptions-item>
          <n-descriptions-item label="可见性">{{ user.privacy }}</n-descriptions-item>
          <n-descriptions-item label="注册">{{ formatUserTime(user.createdAt) }}</n-descriptions-item>
          <n-descriptions-item label="关注">{{ followLabel(user.followedGroups) }}</n-descriptions-item>
          <n-descriptions-item label="投稿">
            共 {{ user.submissionCount }} · 待审 {{ user.pendingCount }} · 通过 {{ user.approvedCount }} · 驳回
            {{ user.rejectedCount }}
          </n-descriptions-item>
          <n-descriptions-item label="通过记分">每张 {{ user.pointsPerApprovedCard ?? 1 }} 分</n-descriptions-item>
        </n-descriptions>
      </n-card>

      <n-card :bordered="false" title="投稿 / 上传记录">
        <div v-if="isNarrow" class="cards">
          <n-card v-for="row in submissions" :key="row.id" size="small">
            <RouterLink class="body-link" :to="{ name: 'submission-detail', params: { id: row.id } }">
              {{ row.slotLabel }}
            </RouterLink>
            <p class="card-meta">{{ row.groupNameZh }} · {{ row.releaseTitle }}</p>
            <p class="card-meta">
              {{ formatUserTime(row.createdAt) }} · 积分 {{ row.pointsAwarded ?? 0 }}
            </p>
          </n-card>
          <p v-if="!submissions.length" class="muted">暂无投稿</p>
        </div>
        <n-data-table
          v-else-if="submissions.length"
          :columns="columns"
          :data="submissions"
          :pagination="false"
          striped
          :scroll-x="720"
          :row-key="(row: Submission) => row.id"
        />
        <p v-else class="muted">暂无投稿</p>
      </n-card>
    </template>
  </n-spin>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.name {
  font-weight: 700;
  font-size: 18px;
}

.muted {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin: 4px 0 0;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.body-link {
  color: var(--color-brand);
  text-decoration: none;
  font-weight: 600;
}

.card-meta {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
