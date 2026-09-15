<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
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
  NSelect,
  NSpace,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { errorMessage } from "../api";
import {
  BENEFIT_CSV_PLACEHOLDER,
  benefitReportFrom,
  deleteBenefitMap,
  disableBenefitChannel,
  importBenefits,
  listBenefitChannels,
  listBenefitMaps,
  retireBenefitMap,
  saveBenefitChannel,
  saveBenefitMap,
  validateBenefits,
  type BenefitChannel,
  type BenefitIssue,
  type BenefitMapRow,
  type BenefitReport,
} from "../catalog/benefits";
import type { Group, Release } from "../catalog/types";
import AdminEmptyState from "../components/AdminEmptyState.vue";
import { useNarrow } from "../narrow";

const props = defineProps<{
  releases: Release[];
  groups: Group[];
}>();

const message = useMessage();
const dialog = useDialog();
const { isNarrow } = useNarrow();
const mapCheckedKeys = ref<Array<string | number>>([]);
const mapModalStyle = {
  width: "min(520px, calc(100vw - 24px))",
  maxHeight: "min(90vh, 880px)",
};

const text = ref("");
const tagsStrict = ref(false);
const notice = ref("");
const noticeType = ref<"success" | "error" | "info">("info");
const report = ref<BenefitReport | null>(null);
const committed = ref(false);
const written = ref(0);
const busy = ref(false);
const mapsLoading = ref(false);
const mapsDeny = ref("");
const maps = ref<BenefitMapRow[]>([]);
const releaseFilter = ref("");
const groupFilter = ref("");
const channels = ref<BenefitChannel[]>([]);
const fileName = ref("");
const channelShow = ref(false);
const channelEditing = ref<BenefitChannel | null>(null);
const channelForm = ref({ code: "", name_zh: "", aliases: "", enabled: true });
const mapShow = ref(false);
const mapEditing = ref<BenefitMapRow | null>(null);
const mapForm = ref({
  groupId: "",
  releaseId: "",
  versionLabel: "standard",
  channelCode: "",
  benefitNameZh: "",
  mapsToSlotLabels: "",
  mapMode: "slots",
  evidenceUrl: "",
  status: "confirmed",
  tagsHint: "",
});
const formBusy = ref(false);

const MAP_MODE_OPTIONS = [
  { label: "slots", value: "slots" },
  { label: "benefit_only", value: "benefit_only" },
];
const MAP_STATUS_OPTIONS = [
  { label: "confirmed", value: "confirmed" },
  { label: "drafting", value: "drafting" },
  { label: "retired", value: "retired" },
];

const canCommit = computed(
  () => !!report.value && report.value.errorCount === 0 && report.value.rowCount > 0 && !committed.value && !busy.value,
);

const releaseOptions = computed(() => [
  { label: "全部发行", value: "" },
  ...props.releases.map((r) => ({
    label: r.groupNameZh ? `${r.groupNameZh} · ${r.title}` : r.title,
    value: r.id,
  })),
]);

const groupOptions = computed(() => [
  { label: "全部组合", value: "" },
  ...props.groups.map((g) => ({
    label: `${g.nameZh} (${g.slug})`,
    value: g.id,
  })),
]);

const issueColumns: DataTableColumns<BenefitIssue> = [
  {
    title: "级别",
    key: "level",
    width: 80,
    render: (row) =>
      h(
        NTag,
        { size: "small", type: row.level === "error" ? "error" : "warning", bordered: false },
        { default: () => row.level },
      ),
  },
  { title: "代码", key: "code", width: 140 },
  { title: "行", key: "row", width: 56 },
  { title: "字段", key: "field", width: 140 },
  { title: "说明", key: "message" },
];

const mapColumns: DataTableColumns<BenefitMapRow> = [
  { type: "selection" },
  { title: "组合", key: "groupSlug", width: 88 },
  { title: "发行", key: "releaseTitle", minWidth: 140 },
  { title: "版本", key: "versionLabel", width: 100 },
  { title: "通路", key: "channelCode", width: 100 },
  { title: "特典", key: "benefitNameZh", minWidth: 140 },
  { title: "卡槽", key: "mapsToSlotLabels", minWidth: 120, render: (row) => row.mapsToSlotLabels || "" },
  { title: "模式", key: "mapMode", width: 100 },
  { title: "状态", key: "status", width: 110, ellipsis: { tooltip: true } },
  {
    title: "",
    key: "actions",
    width: 200,
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(NButton, { size: "tiny", onClick: () => openMap(row) }, { default: () => "编辑" }),
          h(NButton, { size: "tiny", disabled: row.status === "retired", onClick: () => void onRetireMap(row) }, { default: () => "停用" }),
          h(NButton, { size: "tiny", type: "error", onClick: () => void onDeleteMap(row) }, { default: () => "删除" }),
        ],
      }),
  },
];

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

const fileInput = ref<HTMLInputElement | null>(null);

function pickFile() {
  fileInput.value?.click();
}

function applyReport(res: { status: number; body: Parameters<typeof benefitReportFrom>[0]["body"] }, okFallback: string) {
  const next = benefitReportFrom(res);
  if (next) report.value = next;
  if (res.status !== 200) {
    committed.value = false;
    written.value = 0;
    noticeType.value = "error";
    notice.value = errorMessage(res.body, "版本×特典校验未通过，未写入");
    return false;
  }
  return true;
}

async function onValidate() {
  busy.value = true;
  committed.value = false;
  written.value = 0;
  const res = await validateBenefits(text.value, tagsStrict.value);
  busy.value = false;
  if (!applyReport(res, "校验通过，可写入 confirmed 行")) return;
  const ok = !!report.value?.ok && (report.value?.errorCount || 0) === 0;
  noticeType.value = ok ? "success" : "error";
  notice.value = ok ? "校验通过，可写入 confirmed 行" : "校验未通过，请先修错误";
}

async function onCommit() {
  if (!report.value || report.value.errorCount > 0 || !report.value.ok) {
    noticeType.value = "error";
    notice.value = "校验未通过，未写入";
    return;
  }
  busy.value = true;
  const res = await importBenefits(text.value, tagsStrict.value);
  busy.value = false;
  if (!applyReport(res, "写入失败")) {
    message.error(notice.value);
    return;
  }
  const nextWritten = res.body.written || 0;
  const ok = !!report.value?.ok && (report.value?.errorCount || 0) === 0 && res.status === 200;
  if (!ok) {
    committed.value = false;
    written.value = 0;
    noticeType.value = "error";
    notice.value = "版本×特典校验未通过，未写入";
    message.error(notice.value);
    return;
  }
  written.value = nextWritten;
  committed.value = nextWritten > 0;
  noticeType.value = nextWritten ? "success" : "info";
  notice.value = nextWritten ? `已写入 ${nextWritten} 条 confirmed 对照` : "没有可写入的 confirmed 行";
  if (nextWritten) message.success(notice.value);
  await refreshMaps();
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  fileName.value = file.name;
  text.value = await file.text();
  committed.value = false;
  written.value = 0;
}

async function refreshMaps() {
  mapsLoading.value = true;
  mapsDeny.value = "";
  const res = await listBenefitMaps({
    releaseId: releaseFilter.value || undefined,
    groupId: groupFilter.value || undefined,
  });
  mapsLoading.value = false;
  if (res.status !== 200) {
    maps.value = [];
    mapsDeny.value = errorMessage(res.body, res.status === 403 ? "没有权限访问运营接口" : "对照表加载失败");
    return;
  }
  maps.value = res.body.maps || [];
}

async function refreshChannels() {
  const res = await listBenefitChannels();
  if (res.status === 200) channels.value = res.body.channels || [];
}

const channelOptions = computed(() => {
  const current = mapForm.value.channelCode;
  return channels.value
    .filter((c) => c.enabled !== false || c.code === current)
    .map((c) => ({
      label: `${c.code} · ${c.name_zh}${c.enabled === false ? "（停用）" : ""}`,
      value: c.code,
    }));
});

const mapReleaseOptions = computed(() => {
  const list = mapForm.value.groupId
    ? props.releases.filter((r) => r.groupId === mapForm.value.groupId)
    : props.releases;
  return list.map((r) => ({
    label: r.groupNameZh ? `${r.groupNameZh} · ${r.title}` : r.title,
    value: r.id,
  }));
});

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
    message.error(errorMessage(res.body, "通路保存失败"));
    return;
  }
  channelShow.value = false;
  message.success(channelEditing.value ? "通路已保存" : "通路已创建");
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

function openMap(row: BenefitMapRow | null) {
  mapEditing.value = row;
  const release = props.releases.find((r) => r.id === row?.releaseId);
  mapForm.value = {
    groupId: row?.groupId || release?.groupId || groupFilter.value || props.groups[0]?.id || "",
    releaseId: row?.releaseId || releaseFilter.value || "",
    versionLabel: row?.versionLabel || "standard",
    channelCode: row?.channelCode || channels.value.find((c) => c.enabled !== false)?.code || "",
    benefitNameZh: row?.benefitNameZh || "",
    mapsToSlotLabels: row?.mapsToSlotLabels || "",
    mapMode: row?.mapMode || "slots",
    evidenceUrl: row?.evidenceUrl || "",
    status: row?.status || "confirmed",
    tagsHint: row?.tagsHint || "",
  };
  mapShow.value = true;
}

async function onSaveMap() {
  formBusy.value = true;
  const res = await saveBenefitMap(mapEditing.value?.id || null, {
    groupId: mapForm.value.groupId,
    releaseId: mapForm.value.releaseId,
    versionLabel: mapForm.value.versionLabel,
    channelCode: mapForm.value.channelCode,
    benefitNameZh: mapForm.value.benefitNameZh,
    mapsToSlotLabels: mapForm.value.mapsToSlotLabels,
    mapMode: mapForm.value.mapMode,
    evidenceUrl: mapForm.value.evidenceUrl,
    status: mapForm.value.status,
    tagsHint: mapForm.value.tagsHint,
  });
  formBusy.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "对照保存失败"));
    return;
  }
  mapShow.value = false;
  message.success(mapEditing.value ? "对照已保存" : "对照已创建");
  await refreshMaps();
}

async function onRetireMap(row: BenefitMapRow) {
  formBusy.value = true;
  const res = await retireBenefitMap(row.id);
  formBusy.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "停用失败"));
    return;
  }
  message.success("已停用该对照");
  await refreshMaps();
}

async function onDeleteMap(row: BenefitMapRow) {
  formBusy.value = true;
  const res = await deleteBenefitMap(row.id);
  formBusy.value = false;
  if (res.status !== 200) {
    message.error(errorMessage(res.body, "删除失败"));
    return;
  }
  message.success("已删除对照行");
  await refreshMaps();
}

const selectedMaps = computed(() => {
  const ids = new Set(mapCheckedKeys.value.map(String));
  return maps.value.filter((row) => ids.has(row.id));
});

function confirmBatchDeleteMaps() {
  const targets = selectedMaps.value;
  if (!targets.length) {
    message.warning("请先勾选要删除的对照");
    return;
  }
  dialog.error({
    title: "批量删除对照",
    content: `将删除已选 ${targets.length} 条对照，不可恢复。确定继续？`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: () => onBatchDeleteMaps(targets),
  });
}

function confirmBatchRetireMaps() {
  const targets = selectedMaps.value.filter((row) => row.status !== "retired");
  if (!targets.length) {
    message.warning("请先勾选未停用的对照");
    return;
  }
  dialog.warning({
    title: "批量停用对照",
    content: `将停用已选 ${targets.length} 条对照。确定继续？`,
    positiveText: "停用",
    negativeText: "取消",
    onPositiveClick: () => onBatchRetireMaps(targets),
  });
}

async function onBatchDeleteMaps(targets: BenefitMapRow[]) {
  formBusy.value = true;
  let ok = 0;
  let fail = 0;
  let lastError = "";
  for (const row of targets) {
    const res = await deleteBenefitMap(row.id);
    if (res.status === 200) ok += 1;
    else {
      fail += 1;
      lastError = errorMessage(res.body, "删除失败");
    }
  }
  formBusy.value = false;
  mapCheckedKeys.value = [];
  if (fail) message.error(lastError || `已删除 ${ok} 条，失败 ${fail} 条`);
  else message.success(`已删除 ${ok} 条对照`);
  await refreshMaps();
}

async function onBatchRetireMaps(targets: BenefitMapRow[]) {
  formBusy.value = true;
  let ok = 0;
  let fail = 0;
  let lastError = "";
  for (const row of targets) {
    const res = await retireBenefitMap(row.id);
    if (res.status === 200) ok += 1;
    else {
      fail += 1;
      lastError = errorMessage(res.body, "停用失败");
    }
  }
  formBusy.value = false;
  mapCheckedKeys.value = [];
  if (fail) message.error(lastError || `已停用 ${ok} 条，失败 ${fail} 条`);
  else message.success(`已停用 ${ok} 条对照`);
  await refreshMaps();
}

watch([releaseFilter, groupFilter], () => {
  mapCheckedKeys.value = [];
  void refreshMaps();
});

onMounted(() => {
  void refreshMaps();
  void refreshChannels();
});
</script>

<template>
  <div class="b2-page" :class="{ narrow: isNarrow }">
  <p class="muted">
    <strong>通路词典</strong>优先：增改 / 软禁用后，C 端图鉴搜索可用通路中文名与别名找特典。
    B2 的 CSV 校验与写入路径不变；对照单行修补为次要，不是矩阵 CMS。
  </p>
  <n-alert v-if="notice" :type="noticeType" :show-icon="false" class="block">{{ notice }}</n-alert>

  <n-card size="small" title="通路词典" class="report">
    <p class="muted">启用中的通路参与 CSV 校验与 C 端特典搜索；停用后新校验不再认该 code，已落库对照保留。</p>
    <n-button size="small" type="primary" class="block" @click="openChannel(null)">新增通路</n-button>
    <div v-if="channels.length" class="table-wrap">
      <n-data-table :columns="channelColumns" :data="channels" :pagination="false" :scroll-x="720" :row-key="(row: BenefitChannel) => row.code" />
    </div>
    <p v-else class="muted">还没有通路词条。</p>
  </n-card>

  <div class="benefit-form">
    <p class="muted"><strong>CSV 导入（B2）</strong>：按行校验通路词典与卡槽。只把校验通过的 <code>confirmed</code> 行落库；不会自动 published 无图 Template。</p>
    <label class="label">CSV 文件</label>
    <div class="file-row">
      <input
        ref="fileInput"
        id="benefit-file"
        class="file-hidden"
        type="file"
        accept=".csv,text/csv,text/plain"
        @change="onFile"
      />
      <n-button block @click="pickFile">选择 CSV</n-button>
      <span v-if="fileName" class="file-name">{{ fileName }}</span>
    </div>
    <label class="label">内容</label>
    <n-input
      v-model:value="text"
      type="textarea"
      :autosize="{ minRows: 10, maxRows: 18 }"
      :placeholder="BENEFIT_CSV_PLACEHOLDER"
    />
    <n-checkbox v-model:checked="tagsStrict" class="strict">
      tags_strict（tags_hint 缺失则挡 confirmed）
    </n-checkbox>
    <n-space class="toolbar" :vertical="isNarrow" :wrap="true">
      <n-button type="primary" block :loading="busy" @click="onValidate">校验（不写库）</n-button>
      <n-button
        :type="canCommit ? 'success' : 'default'"
        block
        :disabled="!canCommit"
        :loading="busy"
        @click="onCommit"
      >
        写入通过的 confirmed 行
      </n-button>
    </n-space>
  </div>

  <n-card v-if="report" size="small" title="校验报告" class="report">
    <p>
      <span :class="report.ok && report.errorCount === 0 ? 'ok' : 'bad'">
        {{ report.ok && report.errorCount === 0 ? "通过" : "未通过" }}
      </span>
      · {{ report.rowCount }} 行 · {{ report.errorCount }} 个错误 · {{ report.warningCount }} 个警告
      <span v-if="written"> · 已写入 {{ written }}</span>
    </p>
    <div v-if="report.issues.length" class="issue-cards narrow-only">
      <n-card v-for="(issue, idx) in report.issues" :key="`${issue.code}-${idx}`" size="small" class="issue-card">
        <div class="issue-head">
          <n-tag size="small" :type="issue.level === 'error' ? 'error' : 'warning'" :bordered="false">
            {{ issue.level }}
          </n-tag>
          <strong>{{ issue.code }}</strong>
          <span v-if="issue.row" class="muted-inline">行 {{ issue.row }}</span>
        </div>
        <p class="issue-msg">{{ issue.field ? `${issue.field} · ` : "" }}{{ issue.message }}</p>
      </n-card>
    </div>
    <div v-if="report.issues.length" class="table-wrap wide-only">
      <n-data-table :columns="issueColumns" :data="report.issues" :pagination="false" :scroll-x="720" />
    </div>
    <p v-else class="muted">没有问题项</p>
  </n-card>

  <n-card size="small" title="已落库对照（次要）" class="report">
    <p class="muted">浏览 CSV 写入结果。单行增改不是主路径，勿当矩阵 CMS 使用。</p>
    <div class="filters" :class="{ stacked: isNarrow }">
      <div class="filter">
        <label class="label">按发行过滤</label>
        <n-select v-model:value="releaseFilter" :options="releaseOptions" />
      </div>
      <div class="filter">
        <label class="label">按组合过滤</label>
        <n-select v-model:value="groupFilter" :options="groupOptions" />
      </div>
    </div>
    <n-space class="map-toolbar" :size="8" :wrap="true">
      <n-button size="small" type="primary" @click="openMap(null)">新增对照行</n-button>
      <n-button
        size="small"
        type="error"
        :disabled="!mapCheckedKeys.length || formBusy"
        :loading="formBusy"
        @click="confirmBatchDeleteMaps"
      >
        批量删除{{ mapCheckedKeys.length ? ` (${mapCheckedKeys.length})` : "" }}
      </n-button>
      <n-button
        size="small"
        :disabled="!mapCheckedKeys.length || formBusy"
        :loading="formBusy"
        @click="confirmBatchRetireMaps"
      >
        批量停用
      </n-button>
    </n-space>
    <n-alert v-if="mapsDeny" type="error" :show-icon="false" class="block">{{ mapsDeny }}</n-alert>
    <p v-else-if="mapsLoading" class="muted">加载对照表…</p>
    <div v-if="maps.length" class="map-cards narrow-only">
      <n-card v-for="row in maps" :key="row.id" size="small" class="map-card">
        <p class="map-title">{{ row.benefitNameZh }}</p>
        <p class="card-meta">{{ row.groupSlug }} · {{ row.releaseTitle }} · {{ row.versionLabel }}</p>
        <p class="card-meta">{{ row.channelCode }} · {{ row.mapMode }} · {{ row.status }}</p>
        <p v-if="row.mapsToSlotLabels" class="card-meta">卡槽 {{ row.mapsToSlotLabels }}</p>
        <n-space :size="6" style="margin-top: 8px">
          <n-button size="tiny" @click="openMap(row)">编辑</n-button>
          <n-button size="tiny" :disabled="row.status === 'retired'" @click="onRetireMap(row)">停用</n-button>
          <n-button size="tiny" type="error" @click="onDeleteMap(row)">删除</n-button>
        </n-space>
      </n-card>
    </div>
    <div v-if="maps.length" class="table-wrap wide-only">
      <n-data-table
        v-model:checked-row-keys="mapCheckedKeys"
        :columns="mapColumns"
        :data="maps"
        :pagination="false"
        striped
        :scroll-x="1180"
        :row-key="(row: BenefitMapRow) => row.id"
      />
    </div>
    <AdminEmptyState v-if="!mapsDeny && !mapsLoading && !maps.length" copy="还没有对照。可校验 CSV 后写入，或点「新增对照行」。">
      <n-button type="primary" @click="openMap(null)">新增对照行</n-button>
    </AdminEmptyState>
  </n-card>

  <n-modal
    :show="channelShow"
    preset="card"
    :title="channelEditing ? '编辑通路' : '新增通路'"
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

  <n-modal
    :show="mapShow"
    preset="card"
    :title="mapEditing ? '编辑对照' : '新增对照行'"
    :style="mapModalStyle"
    @update:show="mapShow = $event"
  >
    <n-form class="modal-form">
      <n-form-item label="组合" required>
        <n-select v-model:value="mapForm.groupId" :options="groupOptions.filter((o) => o.value)" />
      </n-form-item>
      <n-form-item label="发行" required>
        <n-select v-model:value="mapForm.releaseId" :options="mapReleaseOptions" />
      </n-form-item>
      <n-form-item label="version_label" required>
        <n-input v-model:value="mapForm.versionLabel" />
      </n-form-item>
      <n-form-item label="通路" required>
        <n-select v-model:value="mapForm.channelCode" :options="channelOptions" filterable />
      </n-form-item>
      <n-form-item label="特典名" required>
        <n-input v-model:value="mapForm.benefitNameZh" />
      </n-form-item>
      <n-form-item label="卡槽（分号分隔）">
        <n-input v-model:value="mapForm.mapsToSlotLabels" />
      </n-form-item>
      <n-form-item label="map_mode" required>
        <n-select v-model:value="mapForm.mapMode" :options="MAP_MODE_OPTIONS" />
      </n-form-item>
      <n-form-item label="evidence_url">
        <n-input v-model:value="mapForm.evidenceUrl" placeholder="https://..." />
      </n-form-item>
      <n-form-item label="status" required>
        <n-select v-model:value="mapForm.status" :options="MAP_STATUS_OPTIONS" />
      </n-form-item>
      <n-form-item label="tags_hint">
        <n-input v-model:value="mapForm.tagsHint" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button :disabled="formBusy" @click="mapShow = false">取消</n-button>
        <n-button type="primary" :loading="formBusy" @click="onSaveMap">保存</n-button>
      </n-space>
    </template>
  </n-modal>
  </div>
</template>

<style scoped>
.modal-form {
  max-height: min(calc(90vh - 148px), 732px);
  overflow-y: auto;
  padding-right: 4px;
}
.map-toolbar {
  margin: 12px 0;
}
.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}
.label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 10px 0 6px;
}
.toolbar {
  margin: 12px 0 16px;
}
.block,
.report {
  margin: 12px 0;
}
.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}
.ok {
  color: var(--color-success);
}
.bad {
  color: var(--color-danger);
}
.benefit-form :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.file-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.file-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.strict {
  display: flex;
  margin: 12px 0 4px;
  min-height: 36px;
  align-items: center;
}
.channels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.filters.stacked {
  grid-template-columns: 1fr;
}
.filter :deep(.n-select) {
  min-height: 40px;
}
.issue-cards,
.map-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.issue-msg,
.map-title {
  margin: 8px 0 0;
}
.map-title {
  font-weight: 600;
}
.card-meta,
.muted-inline {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.narrow-only {
  display: none;
}
.wide-only {
  display: block;
}
.narrow .wide-only {
  display: none;
}
.narrow .narrow-only {
  display: flex;
}
.narrow .filters {
  grid-template-columns: 1fr;
}
@media (max-width: 390px) {
  .filters {
    grid-template-columns: 1fr;
  }
  .toolbar :deep(.n-space) {
    flex-direction: column;
  }
  .narrow-only {
    display: flex;
  }
  .wide-only {
    display: none;
  }
  .issue-msg,
  .map-title,
  .card-meta {
    overflow-wrap: anywhere;
  }
}
</style>
