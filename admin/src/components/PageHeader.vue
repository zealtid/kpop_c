<script setup lang="ts">
import { NBreadcrumb, NBreadcrumbItem } from "naive-ui";
import { useRouter } from "vue-router";

defineProps<{
  title: string;
  hint?: string;
  crumbs?: { label: string; to?: { name: string; params?: Record<string, string> } | { name: string } }[];
}>();

const router = useRouter();

function go(to?: { name: string; params?: Record<string, string> } | { name: string }) {
  if (!to) return;
  void router.push(to);
}
</script>

<template>
  <header class="page-header">
    <n-breadcrumb v-if="crumbs?.length" class="crumbs">
      <n-breadcrumb-item @click="go({ name: 'home' })">首页</n-breadcrumb-item>
      <n-breadcrumb-item
        v-for="item in crumbs"
        :key="item.label"
        :clickable="!!item.to"
        @click="go(item.to)"
      >
        {{ item.label }}
      </n-breadcrumb-item>
    </n-breadcrumb>
    <div class="title-row">
      <div>
        <h1 class="title">{{ title }}</h1>
        <p v-if="hint || $slots.hint" class="hint">
          <slot name="hint">{{ hint }}</slot>
        </p>
      </div>
      <div v-if="$slots.extra" class="extra">
        <slot name="extra" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  margin-bottom: 16px;
}

.crumbs {
  margin-bottom: 8px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.hint {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.extra {
  flex-shrink: 0;
}
</style>
