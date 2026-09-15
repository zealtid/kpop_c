<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
  useMessage,
} from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import AuthMediaImg from "../components/AuthMediaImg.vue";
import { errorMessage } from "../api";
import { loadCatalogLookups } from "../catalog/api";
import {
  approveSubmission,
  getSubmission,
  rejectSubmission,
  unpublishTemplate,
  type Submission,
} from "../submissions/api";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const loading = ref(true);
const acting = ref(false);
const deny = ref("");
const item = ref<Submission | null>(null);
const reason = ref("");
const adopt = ref(false);
const mergeId = ref<string | null>(null);
const slotLabel = ref("");
const versionLabel = ref("");
const memberId = ref<string | null>(null);
const channelCode = ref("");
const members = ref<{ label: string; value: string }[]>([]);

const id = computed(() => String(route.params.id || ""));

async function refresh() {
  loading.value = true;
  const res = await getSubmission(id.value);
  if (res.status !== 200) {
    deny.value = errorMessage(res.body, "加载失败");
    item.value = null;
    loading.value = false;
    return;
  }
  deny.value = "";
  item.value = res.body;
  slotLabel.value = res.body.slotLabel;
  versionLabel.value = res.body.versionLabel || "";
  channelCode.value = res.body.channelCode || "";
  memberId.value = res.body.memberId;
  mergeId.value = res.body.duplicateOfTemplateId;
  const lookups = await loadCatalogLookups();
  if (lookups.ok) {
    members.value = lookups.data.members
      .filter((m) => m.groupId === res.body.groupId)
      .map((m) => ({ label: m.nameEn, value: m.id }));
  }
  loading.value = false;
}

onMounted(refresh);

async function onApprove() {
  if (!item.value || acting.value) return;
  acting.value = true;
  const res = await approveSubmission(item.value.id, {
    slotLabel: slotLabel.value,
    versionLabel: versionLabel.value,
    channelCode: channelCode.value || undefined,
    memberId: memberId.value,
    mergeTemplateId: mergeId.value,
    adoptSubmissionImage: adopt.value,
  });
  acting.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "通过失败"));
    return;
  }
  message.success("已通过");
  await refresh();
}

async function onReject() {
  if (!item.value || acting.value) return;
  if (!reason.value.trim()) {
    message.error("请填写驳回原因");
    return;
  }
  acting.value = true;
  const res = await rejectSubmission(item.value.id, reason.value.trim());
  acting.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "驳回失败"));
    return;
  }
  message.success("已驳回");
  await refresh();
}

async function onUnpublish() {
  if (!item.value?.resultTemplateId || acting.value) return;
  acting.value = true;
  const res = await unpublishTemplate(item.value.resultTemplateId);
  acting.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "下架失败"));
    return;
  }
  message.success("已下架");
}
</script>

<template>
  <PageHeader title="投稿详情" hint="对照疑似模板后通过或驳回。合并默认不覆盖主图。" />
  <n-button text style="margin-bottom: 12px" @click="router.push({ name: 'submissions' })">← 返回队列</n-button>
  <n-alert v-if="deny" type="error">{{ deny }}</n-alert>
  <n-spin :show="loading">
    <n-card v-if="item">
      <div v-if="item.status === 'pending_review'" class="pair">
        <div class="face">
          <div class="face-label">卡面</div>
          <AuthMediaImg
            fill
            :admin-media-path="`/admin/catalog-submissions/${item.id}/media/front`"
            :src-path="item.imageFrontUrl || item.imageFront"
            alt="卡面"
          />
        </div>
        <div class="face">
          <div class="face-label">卡背</div>
          <AuthMediaImg
            v-if="item.imageBack || item.imageBackUrl"
            fill
            :admin-media-path="`/admin/catalog-submissions/${item.id}/media/back`"
            :src-path="item.imageBackUrl || item.imageBack"
            alt="卡背"
          />
          <div v-else class="empty-back">未提交卡背</div>
        </div>
      </div>
      <p v-else class="muted">通过/驳回后待审原图会删除；公开主图请到图鉴模板里查看。</p>
      <p class="muted">{{ item.groupNameZh }} · {{ item.releaseTitle }} · {{ item.source }} · {{ item.status }}</p>
      <n-form>
        <n-form-item label="名称/别称">
          <n-input v-model:value="slotLabel" />
        </n-form-item>
        <n-form-item label="版本">
          <n-input v-model:value="versionLabel" />
        </n-form-item>
        <n-form-item label="通路/特典">
          <n-input v-model:value="channelCode" placeholder="词典 code 或手填" />
        </n-form-item>
        <n-form-item label="成员">
          <n-select v-model:value="memberId" clearable :options="members" />
        </n-form-item>
        <n-form-item v-if="item.duplicateCandidates?.length" label="疑似已有模板">
          <n-select
            v-model:value="mergeId"
            clearable
            :options="item.duplicateCandidates.map((c) => ({ label: `${c.name} ${c.version}`, value: c.id }))"
          />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="adopt">采用本稿主图（默认保留原模板主图）</n-checkbox>
        </n-form-item>
      </n-form>
      <n-space v-if="item.status === 'pending_review'">
        <n-button type="primary" :loading="acting" @click="onApprove">通过</n-button>
        <n-input v-model:value="reason" placeholder="驳回原因（投稿人可见）" />
        <n-button type="error" :loading="acting" @click="onReject">驳回</n-button>
      </n-space>
      <n-space v-else-if="item.resultTemplateId">
        <n-button :loading="acting" @click="onUnpublish">强制下架结果模板</n-button>
      </n-space>
      <p v-if="item.rejectReason">驳回原因：{{ item.rejectReason }}</p>
    </n-card>
  </n-spin>
</template>

<style scoped>
.muted {
  color: var(--n-text-color-3);
  margin: 12px 0;
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 560px;
  margin-bottom: 8px;
}
.face-label {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin-bottom: 8px;
}
.empty-back {
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  background: #eee;
  color: #8a8494;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  text-align: center;
  padding: 12px;
}
@media (max-width: 720px) {
  .pair {
    grid-template-columns: 1fr;
    max-width: 280px;
  }
}
</style>
