<script setup lang="ts">
import { NButton, NPagination, NSpace } from "naive-ui";
import { PAGE_SIZES } from "../listQuery";

const props = withDefaults(
  defineProps<{
    page: number;
    pageSize: number;
    itemCount: number;
    showPager?: boolean;
    showActions?: boolean;
    searching?: boolean;
    stacked?: boolean;
  }>(),
  {
    showPager: true,
    showActions: true,
    searching: false,
    stacked: false,
  },
);

const emit = defineEmits<{
  search: [];
  reset: [];
  "update:page": [value: number];
  "update:pageSize": [value: number];
}>();

const pageSizes = [...PAGE_SIZES];
</script>

<template>
  <div class="filter-wrap">
    <div class="filter-row" :class="{ stacked: props.stacked }">
      <div class="filter-fields">
        <n-space :vertical="props.stacked" align="center" wrap :size="[8, 8]">
          <slot />
          <template v-if="showActions">
            <n-button type="primary" :block="props.stacked" :loading="searching" @click="emit('search')">查询</n-button>
            <n-button :block="props.stacked" @click="emit('reset')">重置</n-button>
          </template>
        </n-space>
      </div>
      <div v-if="$slots.actions" class="filter-actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="showPager" class="pager">
      <span class="count">共 {{ itemCount }} 条</span>
      <n-pagination
        :page="page"
        :page-size="pageSize"
        :item-count="itemCount"
        :page-sizes="pageSizes"
        show-size-picker
        :page-slot="props.stacked ? 3 : 5"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-wrap {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  padding-top: 8px;
  background: var(--color-bg-page);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 12px;
  background: var(--color-bg-page);
  border-radius: 8px;
}

.filter-row.stacked {
  flex-direction: column;
  align-items: stretch;
}

.filter-fields {
  min-width: 0;
  flex: 1;
}

.filter-row.stacked .filter-fields :deep(.n-space) {
  width: 100%;
}

.filter-row.stacked .filter-fields :deep(.n-space-item) {
  width: 100%;
}

.filter-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.filter-row.stacked .filter-actions {
  width: 100%;
}

.filter-row.stacked .filter-actions :deep(.n-button) {
  min-height: 36px;
  flex: 1 1 auto;
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.count {
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
