<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NAvatar,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NInput,
  NModal,
  NSpin,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import { errorMessage, mediaUrl } from "../api";
import {
  bindEventLabel,
  followLabel,
  formatUserTime,
  getUser,
  hardDeleteUser,
  listPhoneEvents,
  revealPhone,
  type AdminUser,
  type PhoneBindEvent,
} from "../users/api";
import { listSubmissions, type Submission } from "../submissions/api";
import { useNarrow } from "../narrow";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { isNarrow } = useNarrow();

const userId = computed(() => String(route.params.id || ""));
const loading = ref(true);
const deny = ref("");
const user = ref<AdminUser | null>(null);
const submissions = ref<Submission[]>([]);
const phoneEvents = ref<PhoneBindEvent[]>([]);
const revealedPhone = ref<string | null>(null);
const revealing = ref(false);
const deleteOpen = ref(false);
const deleteConfirm = ref("");
const deleting = ref(false);
const deleteError = ref("");

const canConfirmDelete = computed(() => {
  const u = user.value;
  const typed = deleteConfirm.value.trim();
  if (!u || !typed) return false;
  return typed === u.nickname || typed.toLowerCase() === u.id.toLowerCase();
});

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

const eventColumns = computed<DataTableColumns<PhoneBindEvent>>(() => [
  { title: "时间", key: "createdAt", width: 160, render: (row) => formatUserTime(row.createdAt) },
  { title: "事件", key: "event", width: 100, render: (row) => bindEventLabel(row.event) },
  { title: "脱敏号", key: "phoneMasked", width: 120, render: (row) => row.phoneMasked || "—" },
  { title: "错误码", key: "errorCode", minWidth: 120, render: (row) => row.errorCode || "—" },
]);

async function refresh() {
  loading.value = true;
  deny.value = "";
  user.value = null;
  submissions.value = [];
  phoneEvents.value = [];
  revealedPhone.value = null;
  const res = await getUser(userId.value);
  if (res.status !== 200) {
    deny.value = errorMessage(res.body, "加载失败");
    loading.value = false;
    return;
  }
  user.value = res.body;
  const [hist, events] = await Promise.all([
    listSubmissions({ userId: userId.value }),
    listPhoneEvents(userId.value),
  ]);
  if (hist.ok) submissions.value = hist.submissions;
  if (events.status === 200) phoneEvents.value = events.body.events || [];
  loading.value = false;
}

async function onRevealPhone() {
  if (!user.value || revealing.value) return;
  revealing.value = true;
  const res = await revealPhone(user.value.id);
  revealing.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "无法显示完整号码"));
    return;
  }
  revealedPhone.value = res.body.phoneE164 || "";
  message.success("已记录查看审计");
}

function openDelete() {
  deleteConfirm.value = "";
  deleteError.value = "";
  deleteOpen.value = true;
}

async function onHardDelete() {
  if (!user.value || !canConfirmDelete.value || deleting.value) return;
  deleting.value = true;
  deleteError.value = "";
  const res = await hardDeleteUser(user.value.id, deleteConfirm.value.trim());
  deleting.value = false;
  if (res.status !== 200) {
    deleteError.value = errorMessage(res.body, "删除失败");
    return;
  }
  deleteOpen.value = false;
  const kept = Number(res.body.cleanup?.catalog_kept || 0);
  message.success(kept > 0 ? `已硬删用户；保留 ${kept} 条已发布图鉴` : "已硬删用户");
  void router.push({ name: "users" });
}

onMounted(refresh);
watch(userId, refresh);
</script>

<template>
  <PageHeader
    title="用户详情"
    hint="资料默认脱敏。完整手机号需点「显示」并写审计。硬删不可恢复，须二次确认。"
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
          <n-descriptions-item label="手机号">
            <span>{{ revealedPhone || user.phoneMasked || "未绑定" }}</span>
            <n-button
              v-if="user.phoneBound && !revealedPhone"
              text
              type="primary"
              size="tiny"
              :loading="revealing"
              style="margin-left: 8px"
              @click="onRevealPhone"
            >
              显示完整号码
            </n-button>
          </n-descriptions-item>
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

      <n-card :bordered="false" title="绑定事件" style="margin-bottom: 16px">
        <n-data-table
          v-if="phoneEvents.length"
          :columns="eventColumns"
          :data="phoneEvents"
          :pagination="false"
          striped
          :scroll-x="560"
          :row-key="(row: PhoneBindEvent) => row.id"
        />
        <p v-else class="muted">暂无绑定事件</p>
      </n-card>

      <n-card :bordered="false" title="投稿 / 上传记录" style="margin-bottom: 16px">
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

      <n-card :bordered="false" title="危险操作">
        <n-alert type="error" :show-icon="false" style="margin-bottom: 12px">
          硬删除会物理清除该用户主行、会话、拥有/愿望、投稿元数据与积分，不可恢复。已发布图鉴作为平台资产保留并断开作者关联。不支持批量删除。
        </n-alert>
        <n-button type="error" @click="openDelete">永久删除此用户</n-button>
      </n-card>
    </template>
  </n-spin>

  <n-modal v-model:show="deleteOpen" preset="card" title="永久删除用户" style="width: 480px" :mask-closable="false">
    <n-alert type="warning" :show-icon="false" style="margin-bottom: 12px">
      请输入昵称「{{ user?.nickname }}」或用户 ID 以二次确认。误点不会删除。
    </n-alert>
    <n-input v-model:value="deleteConfirm" placeholder="昵称或用户 ID" @keyup.enter="onHardDelete" />
    <n-alert v-if="deleteError" type="error" :show-icon="false" style="margin-top: 12px">{{ deleteError }}</n-alert>
    <template #footer>
      <n-button @click="deleteOpen = false">取消</n-button>
      <n-button type="error" :disabled="!canConfirmDelete" :loading="deleting" style="margin-left: 8px" @click="onHardDelete">
        永久删除
      </n-button>
    </template>
  </n-modal>
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
