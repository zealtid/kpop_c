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
  }>(),
  {
    showPager: true,
    showActions: true,
    searching: false,
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
    <div class="filter-row">
      <n-space align="center" wrap :size="[8, 8]">
        <slot />
        <template v-if="showActions">
          <n-button type="primary" :loading="searching" @click="emit('search')">查询</n-button>
          <n-button @click="emit('reset')">重置</n-button>
        </template>
        <slot name="actions" />
      </n-space>
    </div>
    <div v-if="showPager" class="pager">
      <span class="count">共 {{ itemCount }} 条</span>
      <n-pagination
        :page="page"
        :page-size="pageSize"
        :item-count="itemCount"
        :page-sizes="pageSizes"
        show-size-picker
        :page-slot="5"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.filter-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.filter-row {
  padding: 12px;
  background: var(--color-bg-page);
  border-radius: 8px;
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
