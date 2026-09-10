<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NInput,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { errorMessage } from "../api";
import {
  BENEFIT_CSV_PLACEHOLDER,
  benefitReportFrom,
  importBenefits,
  listBenefitChannels,
  listBenefitMaps,
  validateBenefits,
  type BenefitChannel,
  type BenefitIssue,
  type BenefitMapRow,
  type BenefitReport,
} from "../catalog/benefits";
import type { Group, Release } from "../catalog/types";
import { useNarrow } from "../narrow";

const props = defineProps<{
  releases: Release[];
  groups: Group[];
}>();

const message = useMessage();
const { isNarrow } = useNarrow();

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
  { title: "组合", key: "groupSlug", width: 88 },
  { title: "发行", key: "releaseTitle", minWidth: 140 },
  { title: "版本", key: "versionLabel", width: 100 },
  { title: "通路", key: "channelCode", width: 100 },
  { title: "特典", key: "benefitNameZh", minWidth: 140 },
  { title: "卡槽", key: "mapsToSlotLabels", minWidth: 120, render: (row) => row.mapsToSlotLabels || "" },
  { title: "模式", key: "mapMode", width: 100 },
  { title: "状态", key: "status", width: 110, ellipsis: { tooltip: true } },
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
  notice.value = nextWritten ? `已写入 ${nextWritten} 条 confirmed 对照（只读）` : "没有可写入的 confirmed 行";
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

watch([releaseFilter, groupFilter], () => {
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
    上传运营 Sheet/CSV，按行校验通路词典与卡槽。只把校验通过的
    <code>confirmed</code> 行只读落库；<strong>不会</strong>自动 published 无图 Template，也不改图鉴导入。
    词典与别名由 API 处理。
  </p>
  <n-alert v-if="notice" :type="noticeType" :show-icon="false" class="block">{{ notice }}</n-alert>

  <div class="benefit-form">
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

  <n-card v-if="channels.length" size="small" title="通路词典（只读 · API）" class="report">
    <p class="muted">别名归一由后端完成，前端不改词典。</p>
    <div class="channels">
      <n-tag v-for="ch in channels" :key="ch.code" size="small" :bordered="false">
        {{ ch.code }} · {{ ch.name_zh }}
      </n-tag>
    </div>
  </n-card>

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

  <n-card size="small" title="已落库对照（只读）" class="report">
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
    <n-alert v-if="mapsDeny" type="error" :show-icon="false" class="block">{{ mapsDeny }}</n-alert>
    <p v-else-if="mapsLoading" class="muted">加载对照表…</p>
    <div v-if="maps.length" class="map-cards narrow-only">
      <n-card v-for="row in maps" :key="row.id" size="small" class="map-card">
        <p class="map-title">{{ row.benefitNameZh }}</p>
        <p class="card-meta">{{ row.groupSlug }} · {{ row.releaseTitle }} · {{ row.versionLabel }}</p>
        <p class="card-meta">{{ row.channelCode }} · {{ row.mapMode }} · {{ row.status }}</p>
        <p v-if="row.mapsToSlotLabels" class="card-meta">卡槽 {{ row.mapsToSlotLabels }}</p>
      </n-card>
    </div>
    <div v-if="maps.length" class="table-wrap wide-only">
      <n-data-table :columns="mapColumns" :data="maps" :pagination="false" :scroll-x="960" :row-key="(row: BenefitMapRow) => row.id" />
    </div>
    <p v-if="!mapsDeny && !mapsLoading && !maps.length" class="muted">还没有 confirmed 对照。校验通过后可写入。</p>
  </n-card>
  </div>
</template>

<style scoped>
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
