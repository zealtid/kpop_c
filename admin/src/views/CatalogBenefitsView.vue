<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { useRouter } from "vue-router";
import { errorMessage } from "../api";
import {
  disableBenefitChannel,
  listBenefitChannels,
  saveBenefitChannel,
  type BenefitChannel,
} from "../catalog/benefits";
import { useNarrow } from "../narrow";

const message = useMessage();
const router = useRouter();
const { isNarrow } = useNarrow();
const channels = ref<BenefitChannel[]>([]);
const channelShow = ref(false);
const channelEditing = ref<BenefitChannel | null>(null);
const channelForm = ref({ code: "", name_zh: "", aliases: "", enabled: true });
const formBusy = ref(false);

const channelColumns: DataTableColumns<BenefitChannel> = [
  { title: "code", key: "code", width: 140 },
  { title: "中文名", key: "name_zh", minWidth: 120 },
  { title: "别名", key: "aliases", minWidth: 160, render: (row) => (row.aliases || []).join(", ") },
  {
    title: "状态",
    key: "enabled",
    width: 80,
    render: (row) =>
      h(NTag, { size: "small", type: row.enabled === false ? "default" : "success", bordered: false }, {
        default: () => (row.enabled === false ? "停用" : "启用"),
      }),
  },
  {
    title: "",
    key: "actions",
    width: 160,
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(NButton, { size: "tiny", onClick: () => openChannel(row) }, { default: () => "编辑" }),
          h(
            NButton,
            { size: "tiny", disabled: row.enabled === false, onClick: () => void onDisableChannel(row) },
            { default: () => "停用" },
          ),
        ],
      }),
  },
];

async function refreshChannels() {
  const res = await listBenefitChannels();
  if (res.status === 200) channels.value = res.body.channels || [];
}

function openChannel(row: BenefitChannel | null) {
  channelEditing.value = row;
  channelForm.value = {
    code: row?.code || "",
    name_zh: row?.name_zh || "",
    aliases: (row?.aliases || []).join(", "),
    enabled: row?.enabled !== false,
  };
  channelShow.value = true;
}

async function onSaveChannel() {
  formBusy.value = true;
  const res = await saveBenefitChannel(channelEditing.value?.code || null, {
    code: channelForm.value.code,
    name_zh: channelForm.value.name_zh,
    aliases: channelForm.value.aliases,
    enabled: channelForm.value.enabled,
  });
  formBusy.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "特典保存失败"));
    return;
  }
  channelShow.value = false;
  message.success(channelEditing.value ? "特典已保存" : "特典已创建");
  await refreshChannels();
}

async function onDisableChannel(row: BenefitChannel) {
  formBusy.value = true;
  const res = await disableBenefitChannel(row.code);
  formBusy.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "停用失败"));
    return;
  }
  message.success(`已停用 ${row.code}`);
  await refreshChannels();
}

function goTemplates() {
  void router.push({ name: "catalog", params: { tab: "templates" } });
}

onMounted(() => {
  void refreshChannels();
});
</script>

<template>
  <div class="b2-page" :class="{ narrow: isNarrow }">
    <n-alert type="warning" :show-icon="false" class="block">
      版本×特典对照表已废弃，不再导入、不再展示矩阵。请维护本页「特典词典」；卡面请到「小卡模板/维护」。
      <n-button text type="primary" @click="goTemplates">去模板维护</n-button>
    </n-alert>

    <p class="muted">
      启用中的特典参与 C 端图鉴搜索与投稿选择器。停用后新选择不再认该 code。技术字段仍为
      <code>channel_code</code>。
    </p>

    <n-card size="small" title="特典词典" class="report">
      <n-button size="small" type="primary" class="block" @click="openChannel(null)">新增特典</n-button>
      <div v-if="channels.length" class="table-wrap">
        <n-data-table
          :columns="channelColumns"
          :data="channels"
          :pagination="false"
          :scroll-x="720"
          :row-key="(row: BenefitChannel) => row.code"
        />
      </div>
      <p v-else class="muted">还没有特典词条。</p>
    </n-card>

    <n-modal
      :show="channelShow"
      preset="card"
      :title="channelEditing ? '编辑特典' : '新增特典'"
      :style="{ width: 'min(440px, calc(100vw - 24px))' }"
      @update:show="channelShow = $event"
    >
      <n-form>
        <n-form-item label="code" required>
          <n-input v-model:value="channelForm.code" :disabled="!!channelEditing" placeholder="weverse" />
        </n-form-item>
        <n-form-item label="中文名" required>
          <n-input v-model:value="channelForm.name_zh" />
        </n-form-item>
        <n-form-item label="别名（逗号分隔）">
          <n-input v-model:value="channelForm.aliases" />
        </n-form-item>
        <n-form-item>
          <n-checkbox v-model:checked="channelForm.enabled">启用</n-checkbox>
        </n-form-item>
        <n-space justify="end">
          <n-button :disabled="formBusy" @click="channelShow = false">取消</n-button>
          <n-button type="primary" :loading="formBusy" @click="onSaveChannel">保存</n-button>
        </n-space>
      </n-form>
    </n-modal>
  </div>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}
.block,
.report {
  margin: 12px 0;
}
.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}
</style>
