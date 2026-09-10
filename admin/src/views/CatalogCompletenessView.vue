<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { NAlert, NCard, NDataTable, NTag, type DataTableColumns } from "naive-ui";
import {
  gateLabel,
  gateTagType,
  loadCompleteness,
  sliceLabel,
  type CompletenessGroup,
  type CompletenessRelease,
  type PublishGate,
} from "../catalog/completeness";
import { statusLabel } from "../catalog/types";
import { useNarrow } from "../narrow";

const { isNarrow } = useNarrow();
const loading = ref(true);
const deny = ref("");
const groups = ref<CompletenessGroup[]>([]);

const releaseColumns: DataTableColumns<CompletenessRelease> = [
  {
    title: "发行",
    key: "title",
    minWidth: 160,
    render: (row) =>
      h("div", [h("div", row.title), h("div", { class: "xk-cell-muted" }, `${row.kind} · ${row.releasedOn || ""}`)]),
  },
  {
    title: "状态",
    key: "status",
    width: 88,
    render: (row) => statusTag(row.status),
  },
  {
    title: "草稿/发布/废弃",
    key: "counts",
    width: 130,
    render: (row) => `${row.draftCount} / ${row.publishedCount} / ${row.deprecatedCount}`,
  },
  {
    title: "缺主图",
    key: "missingMainImage",
    width: 80,
    render: (row) =>
      row.missingMainImage
        ? h("span", { style: "color: var(--color-warning)" }, String(row.missingMainImage))
        : "0",
  },
  {
    title: "缺成员",
    key: "missingMembers",
    minWidth: 140,
    render: (row) => (row.missingMembers.length ? row.missingMembers.map((m) => m.nameEn).join(", ") : "—"),
  },
  {
    title: "切片",
    key: "inAllowedSlice",
    width: 88,
    render: (row) => sliceLabel(row.inAllowedSlice),
  },
  {
    title: "发布闸门",
    key: "publishGate",
    minWidth: 220,
    render: (row) => gateCell(row.publishGate),
  },
];

function statusTag(status: string) {
  const type = status === "published" ? "success" : status === "deprecated" ? "error" : "default";
  return h(NTag, { size: "small", type, bordered: false }, { default: () => statusLabel(status) });
}

function gateTag(gate: PublishGate) {
  return h(
    NTag,
    { size: "small", type: gateTagType(gate.status), bordered: false },
    { default: () => gateLabel(gate.status) },
  );
}

function gateCell(gate: PublishGate) {
  const blockers = gate.blockers.length
    ? h(
        "ul",
        { class: "xk-blockers" },
        gate.blockers.map((b) => h("li", b.message)),
      )
    : h("span", { class: "xk-cell-muted" }, "无拦截");
  return h("div", [gateTag(gate), blockers]);
}

const empty = computed(() => !loading.value && !deny.value && !groups.value.length);

async function refresh() {
  loading.value = true;
  deny.value = "";
  const result = await loadCompleteness();
  loading.value = false;
  if (!result.ok) {
    deny.value = result.message;
    groups.value = [];
    return;
  }
  groups.value = result.groups;
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <p class="muted">
    按组合 / 发行统计草稿与已发布、缺主图、缺成员。扩展专辑的发布闸门只展示状态，<strong>不</strong>接入签署人流程。本页只读。
  </p>
  <n-alert v-if="deny" type="error" :show-icon="false" class="block">{{ deny }}</n-alert>
  <p v-else-if="loading" class="muted">加载完整度…</p>
  <p v-else-if="empty" class="muted">暂无组合</p>

  <n-card v-for="group in groups" :key="group.id" size="small" class="group-card">
    <template #header>
      <div class="group-head">
        <span>{{ group.nameZh }}</span>
        <span class="slug">{{ group.slug }}</span>
        <n-tag size="small" :type="group.status === 'published' ? 'success' : group.status === 'deprecated' ? 'error' : 'default'" :bordered="false">
          {{ statusLabel(group.status) }}
        </n-tag>
      </div>
    </template>
    <p class="stats">
      草稿 {{ group.draftCount }} · 已发布 {{ group.publishedCount }} · 废弃 {{ group.deprecatedCount }}
      · 缺主图 {{ group.missingMainImage }} · 缺成员卡 {{ group.missingMembers }}
    </p>
    <div class="gate-row">
      <n-tag size="small" :type="gateTagType(group.expansionGate.status)" :bordered="false">
        {{ gateLabel(group.expansionGate.status) }}
      </n-tag>
      <span class="note">{{ group.expansionGate.signOffNote }}</span>
    </div>
    <ul v-if="group.expansionGate.blockers.length" class="blockers">
      <li v-for="b in group.expansionGate.blockers" :key="b.code">{{ b.message }}</li>
    </ul>
    <p v-else class="muted-inline">无拦截</p>

    <div v-if="group.releases.length" class="rel-cards narrow-only">
      <n-card v-for="rel in group.releases" :key="rel.id" size="small" class="rel-card">
        <div class="rel-head">
          <strong>{{ rel.title }}</strong>
          <n-tag size="small" :type="rel.status === 'published' ? 'success' : rel.status === 'deprecated' ? 'error' : 'default'" :bordered="false">
            {{ statusLabel(rel.status) }}
          </n-tag>
        </div>
        <p class="card-meta">{{ rel.kind }} · {{ rel.releasedOn || "" }} · {{ sliceLabel(rel.inAllowedSlice) }}</p>
        <p class="card-meta">
          草稿 {{ rel.draftCount }} · 已发布 {{ rel.publishedCount }} · 废弃 {{ rel.deprecatedCount }}
          · 缺主图
          <span :class="{ warn: rel.missingMainImage }">{{ rel.missingMainImage }}</span>
        </p>
        <p class="card-meta">
          缺成员
          {{ rel.missingMembers.length ? rel.missingMembers.map((m) => m.nameEn).join(", ") : "—" }}
        </p>
        <div class="gate-row">
          <n-tag size="small" :type="gateTagType(rel.publishGate.status)" :bordered="false">
            {{ gateLabel(rel.publishGate.status) }}
          </n-tag>
        </div>
        <ul v-if="rel.publishGate.blockers.length" class="blockers">
          <li v-for="b in rel.publishGate.blockers" :key="b.code">{{ b.message }}</li>
        </ul>
      </n-card>
    </div>
    <div v-if="group.releases.length" class="table-wrap wide-only">
      <n-data-table
        :columns="releaseColumns"
        :data="group.releases"
        :pagination="false"
        :scroll-x="880"
        :row-key="(row: CompletenessRelease) => row.id"
      />
    </div>
    <p v-if="!group.releases.length" class="muted">该组合暂无发行</p>
  </n-card>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin: 0 0 12px;
}
.muted-inline {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin: 6px 0 12px;
}
.block {
  margin-bottom: 12px;
}
.group-card {
  margin: 12px 0;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.slug,
.note,
.card-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 400;
}
.stats {
  margin: 0 0 8px;
  font-size: 13px;
}
.gate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.blockers {
  margin: 6px 0 12px;
  padding-left: 18px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}
.rel-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.rel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-meta {
  margin: 4px 0 0;
}
.warn {
  color: var(--color-warning);
}
.narrow-only {
  display: none;
}
.wide-only {
  display: block;
}
@media (max-width: 390px) {
  .narrow-only {
    display: flex;
  }
  .wide-only {
    display: none;
  }
  .card-meta,
  .stats,
  .note {
    overflow-wrap: anywhere;
  }
}
</style>

<style>
.xk-cell-muted {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.xk-blockers {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
