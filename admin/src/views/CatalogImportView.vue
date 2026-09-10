<script setup lang="ts">
import { computed, ref } from "vue";
import { NAlert, NButton, NCard, NDataTable, NInput, NSelect, NSpace, type DataTableColumns } from "naive-ui";
import {
  commitImport,
  importPlaceholder,
  importReportFrom,
  type ImportIssue,
  type ImportReport,
  validateImport,
} from "../catalog/import";
import { errorMessage } from "../api";

const format = ref("csv");
const text = ref("");
const notice = ref("");
const noticeType = ref<"success" | "error" | "info">("info");
const report = ref<ImportReport | null>(null);
const committed = ref(false);
const busy = ref(false);

const formatOptions = [
  { label: "CSV", value: "csv" },
  { label: "Markdown 表格", value: "markdown" },
  { label: "JSON（兼容 POST /admin/import）", value: "json" },
];

const canCommit = computed(() => !!report.value?.ok && !committed.value && !busy.value);

const batchColumns: DataTableColumns<ImportReport["batches"][number]> = [
  { title: "组合", key: "groupSlug" },
  { title: "发行", key: "releaseTitle" },
  { title: "kind", key: "kind", width: 120 },
  { title: "模板", key: "templateCount", width: 72 },
  {
    title: "发行",
    key: "creatingRelease",
    render: (row) => (row.creatingRelease ? "将新建发行" : "已有发行"),
  },
  {
    title: "约束",
    key: "constrained",
    render: (row) => (row.constrained ? "受切片约束" : "—"),
  },
];

const issueColumns: DataTableColumns<ImportIssue> = [
  { title: "级别", key: "level", width: 80 },
  { title: "代码", key: "code", width: 140 },
  { title: "行", key: "row", width: 56 },
  { title: "字段", key: "field", width: 120 },
  { title: "说明", key: "message" },
];

async function onValidate() {
  busy.value = true;
  committed.value = false;
  const res = await validateImport(format.value, text.value);
  busy.value = false;
  report.value = importReportFrom(res);
  if (res.status !== 200) {
    noticeType.value = "error";
    notice.value = errorMessage(res.body);
    return;
  }
  const ok = !!report.value?.ok;
  noticeType.value = ok ? "success" : "error";
  notice.value = ok ? "校验通过，可以写入" : "校验未通过，请先修错误";
}

async function onCommit() {
  if (!report.value?.ok) return;
  busy.value = true;
  const res = await commitImport(format.value, text.value);
  busy.value = false;
  const next = importReportFrom(res);
  if (next) report.value = next;
  if (res.status !== 200) {
    committed.value = false;
    noticeType.value = "error";
    notice.value = errorMessage(res.body);
    return;
  }
  committed.value = !!res.body.committed;
  noticeType.value = committed.value ? "success" : "info";
  notice.value = committed.value ? `已写入 ${res.body.count ?? 0} 条模板` : "未写入";
}
</script>

<template>
  <p class="muted">支持 JSON / CSV / Markdown 表格。先出校验报告，确认无错误再写入。失败会留在本页，不会静默吞掉。</p>
  <n-alert v-if="notice" :type="noticeType" :show-icon="false" class="block">{{ notice }}</n-alert>
  <div class="import-form">
    <label class="label">格式</label>
    <n-select v-model:value="format" :options="formatOptions" />
    <label class="label">内容</label>
    <n-input
      v-model:value="text"
      type="textarea"
      :autosize="{ minRows: 10, maxRows: 18 }"
      :placeholder="importPlaceholder(format)"
    />
    <n-space class="toolbar">
      <n-button type="primary" :loading="busy" @click="onValidate">校验（不写库）</n-button>
      <n-button type="success" :disabled="!canCommit" :loading="busy" @click="onCommit">写入数据库</n-button>
    </n-space>
  </div>

  <n-card v-if="report" size="small" title="校验报告" class="report">
    <p>
      <span :class="report.ok ? 'ok' : 'bad'">{{ report.ok ? "通过" : "未通过" }}</span>
      · {{ report.rowCount }} 行 · {{ report.errorCount }} 个错误 · {{ report.warningCount }} 个警告
      · 格式 {{ report.format }}
    </p>
    <div v-if="report.batches.length" class="table-wrap">
      <n-data-table :columns="batchColumns" :data="report.batches" :pagination="false" :scroll-x="640" />
    </div>
    <div v-if="report.issues.length" class="table-wrap">
      <n-data-table :columns="issueColumns" :data="report.issues" :pagination="false" :scroll-x="720" />
    </div>
    <p v-else class="muted">没有问题项</p>
  </n-card>
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
.import-form :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
</style>
