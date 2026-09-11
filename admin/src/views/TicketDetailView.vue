<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  useMessage,
} from "naive-ui";
import { RouterLink, useRoute } from "vue-router";
import { errorMessage } from "../api";
import { authUser } from "../auth";
import { loadCatalog } from "../catalog/api";
import PageHeader from "../components/PageHeader.vue";
import { statusLabel, type Member, type Release, type Template } from "../catalog/types";
import {
  createDraftAndLink,
  getTicket,
  linkTicketTemplate,
  updateTicket,
  type TicketPatchBody,
} from "../tickets/api";
import {
  formatTicketTime,
  isClosedTicket,
  isTicketStatus,
  ticketStatusLabel,
  ticketStatusTagType,
  type Ticket,
  type TicketStatus,
} from "../tickets/types";
import { useNarrow } from "../narrow";

const route = useRoute();
const message = useMessage();
const { isNarrow } = useNarrow();

const ticketId = computed(() => String(route.params.id || ""));

const loading = ref(true);
const acting = ref(false);
const deny = ref("");
const notice = ref("");
const noticeOk = ref(false);
const ticket = ref<Ticket | null>(null);
const releases = ref<Release[]>([]);
const members = ref<Member[]>([]);
const templates = ref<Template[]>([]);

const internalNote = ref("");
const linkTemplateId = ref("");
const draftReleaseId = ref("");
const draftMemberId = ref("");
const draftVersion = ref("");
const draftName = ref("");
const draftIsBenefit = ref(false);

const closed = computed(() => (ticket.value ? isClosedTicket(ticket.value.status) : false));

const templateOptions = computed(() => [
  { label: "选择已有模板", value: "" },
  ...templates.value.map((t) => ({
    label: `${t.groupNameZh || ""} · ${t.releaseTitle || ""} · ${t.memberNameEn || "group"} · ${t.version} (${t.catalogStatus || t.status})`,
    value: t.id,
  })),
]);

const releaseOptions = computed(() =>
  releases.value.map((r) => ({
    label: `${r.groupNameZh || ""} · ${r.title}`,
    value: r.id,
  })),
);

const memberOptions = computed(() => [
  { label: "（组合卡 / 无成员）", value: "" },
  ...members.value.map((m) => ({
    label: `${m.groupNameZh || ""} · ${m.nameEn}`,
    value: m.id,
  })),
]);

function flash(ok: boolean, text: string) {
  notice.value = text;
  noticeOk.value = ok;
  if (ok) message.success(text);
  else message.error(text);
}

function applyTicket(next: Ticket) {
  ticket.value = next;
  internalNote.value = next.internalNote || "";
  linkTemplateId.value = next.linkedTemplate?.id || "";
}

async function refresh() {
  if (!ticketId.value) return;
  loading.value = true;
  deny.value = "";
  const [ticketRes, catalog] = await Promise.all([getTicket(ticketId.value), loadCatalog()]);
  loading.value = false;
  if (ticketRes.status === 403 || (!catalog.ok && catalog.status === 403)) {
    deny.value = "没有权限访问运营接口";
    ticket.value = null;
    return;
  }
  if (ticketRes.status !== 200) {
    deny.value = errorMessage(ticketRes.body, "工单不存在");
    ticket.value = null;
    return;
  }
  applyTicket(ticketRes.body);
  if (catalog.ok) {
    releases.value = catalog.data.releases;
    members.value = catalog.data.members;
    templates.value = catalog.data.templates;
    if (!draftReleaseId.value && catalog.data.releases[0]) {
      draftReleaseId.value = catalog.data.releases[0].id;
    }
  }
}

async function onStatus(status: TicketStatus) {
  if (!ticket.value) return;
  if (!isTicketStatus(status)) return;
  if (isClosedTicket(status) && !internalNote.value.trim()) {
    flash(false, "关闭工单需填写内部备注");
    return;
  }
  acting.value = true;
  const body: TicketPatchBody = {
    status,
    internalNote: internalNote.value,
  };
  // 认领时带上现网 assigneeOpsId；无运营 id 则交给后端用 actor 回填，不强造新指派模型
  if (status === "in_progress" && authUser.value?.id) {
    body.assigneeOpsId = authUser.value.id;
  }
  const res = await updateTicket(ticket.value.id, body);
  acting.value = false;
  if (res.status !== 200) {
    flash(false, errorMessage(res.body));
    return;
  }
  applyTicket(res.body);
  flash(true, `已更新为 ${status}`);
}

async function onLinkExisting() {
  if (!ticket.value) return;
  if (!linkTemplateId.value) {
    flash(false, "请选择要关联的模板");
    return;
  }
  acting.value = true;
  const res = await linkTicketTemplate(ticket.value.id, linkTemplateId.value);
  acting.value = false;
  if (res.status !== 200) {
    flash(false, errorMessage(res.body));
    return;
  }
  applyTicket(res.body);
  flash(true, "已关联模板");
}

async function onCreateDraft() {
  if (!ticket.value) return;
  if (!draftReleaseId.value || !draftVersion.value.trim()) {
    flash(false, "请填写发行和版本");
    return;
  }
  acting.value = true;
  const res = await createDraftAndLink(ticket.value.id, {
    releaseId: draftReleaseId.value,
    memberId: draftMemberId.value || undefined,
    version: draftVersion.value.trim(),
    name: draftName.value.trim() || undefined,
    isBenefit: draftIsBenefit.value,
  });
  acting.value = false;
  if (res.status !== 200) {
    flash(false, errorMessage(res.body));
    return;
  }
  applyTicket(res.body.ticket);
  flash(true, "已创建草稿模板并关联");
  await refresh();
}

watch(ticketId, () => {
  notice.value = "";
  void refresh();
});

onMounted(() => {
  void refresh();
});
</script>

<template>
  <PageHeader
    title="工单详情"
    :crumbs="[
      { label: '反馈 / 工单', to: { name: 'tickets' } },
      { label: ticketId ? ticketId.slice(0, 8) : '详情' },
    ]"
  />
  <n-spin :show="loading">
    <n-card :bordered="false">
      <p>
        <RouterLink :to="{ name: 'tickets' }">← 工单列表</RouterLink>
      </p>
      <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>
      <template v-else-if="ticket">
        <n-alert v-if="notice" :type="noticeOk ? 'success' : 'error'" :show-icon="false" class="block">
          {{ notice }}
        </n-alert>
        <p class="meta">
          <n-tag size="small" :type="ticketStatusTagType(ticket.status)" :bordered="false">
            {{ ticketStatusLabel(ticket.status) }}
          </n-tag>
          <span>{{ ticket.user.nickname }}</span>
          <span>{{ formatTicketTime(ticket.createdAt) }}</span>
        </p>
        <p v-if="ticket.assignee" class="muted">处理人 {{ ticket.assignee.username }}</p>
        <pre class="ticket-body">{{ ticket.body }}</pre>

        <n-space class="row-actions" :wrap="true" :vertical="isNarrow" :size="8">
          <template v-if="closed">
            <n-button size="small" :disabled="acting" @click="onStatus('open')">重开</n-button>
          </template>
          <template v-else>
            <n-button
              v-if="ticket.status !== 'in_progress'"
              size="small"
              :disabled="acting"
              @click="onStatus('in_progress')"
            >
              认领
            </n-button>
            <n-button v-else size="small" :disabled="acting" @click="onStatus('open')">放回待处理</n-button>
            <n-button size="small" type="success" :disabled="acting" @click="onStatus('done')">完成</n-button>
            <n-button size="small" type="error" :disabled="acting" @click="onStatus('wontfix')">不修复</n-button>
          </template>
        </n-space>

        <n-form class="note-form" @submit.prevent>
          <n-form-item label="内部备注（关闭时必填，不展示给 C 端）">
            <n-input v-model:value="internalNote" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" />
          </n-form-item>
          <p class="muted">点「完成 / 不修复」时会带上这段备注。</p>
        </n-form>
      </template>
    </n-card>

    <n-card v-if="ticket && !deny" title="关联 PhotocardTemplate（草稿）" class="second">
      <template v-if="ticket.linkedTemplate">
        <p>
          {{ ticket.linkedTemplate.name || "" }} ·
          <n-tag size="small" :bordered="false">{{ statusLabel(ticket.linkedTemplate.status || "draft") }}</n-tag>
          <span class="muted-inline">{{ ticket.linkedTemplate.dedupeKey || "" }}</span>
        </p>
        <p class="muted">工单不提供发布入库。要上图鉴请到「图鉴 → 小卡模板」。</p>
      </template>
      <p v-else class="muted">尚未关联模板</p>

      <n-form class="form" @submit.prevent="onLinkExisting">
        <n-form-item label="已有模板">
          <n-select v-model:value="linkTemplateId" filterable :options="templateOptions" />
        </n-form-item>
        <n-button type="primary" attr-type="submit" :loading="acting" :block="isNarrow">关联已有模板</n-button>
      </n-form>

      <n-form class="form create" @submit.prevent="onCreateDraft">
        <h2 class="h2">新建草稿模板并关联</h2>
        <p class="muted">只会建成 <strong>draft</strong>，不会发布到图鉴。</p>
        <n-form-item label="发行" required>
          <n-select v-model:value="draftReleaseId" filterable :options="releaseOptions" />
        </n-form-item>
        <n-form-item label="成员">
          <n-select v-model:value="draftMemberId" filterable :options="memberOptions" />
        </n-form-item>
        <n-form-item label="版本" required>
          <n-input v-model:value="draftVersion" placeholder="例如 POB-missing" />
        </n-form-item>
        <n-form-item label="名称">
          <n-input v-model:value="draftName" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="draftIsBenefit">特典</n-checkbox>
        </n-form-item>
        <n-button type="primary" attr-type="submit" :loading="acting" :block="isNarrow">创建草稿并关联</n-button>
      </n-form>
    </n-card>
  </n-spin>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}

.muted-inline {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 8px;
}

.block {
  margin: 12px 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.ticket-body {
  white-space: pre-wrap;
  background: var(--color-bg-page);
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  font: inherit;
  overflow-wrap: anywhere;
}

.row-actions {
  margin: 12px 0;
}

.note-form,
.form {
  margin-top: 16px;
}

.second {
  margin-top: 16px;
}

.h2 {
  font-size: 16px;
  margin: 0 0 8px;
}

.create {
  margin-top: 20px;
  padding-top: 8px;
}

@media (max-width: 390px) {
  .ticket-body,
  .meta,
  .muted {
    overflow-wrap: anywhere;
  }
}
</style>
