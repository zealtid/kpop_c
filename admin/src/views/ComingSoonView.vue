<script setup lang="ts">
import { NAlert, NCard } from "naive-ui";
import { computed } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "../components/PageHeader.vue";

const route = useRoute();
const title = computed(() => (typeof route.meta.title === "string" ? route.meta.title : "即将推出"));
const hint = computed(() => (typeof route.meta.hint === "string" ? route.meta.hint : "切片后续"));
</script>

<template>
  <PageHeader :title="title" :hint="hint" :crumbs="[{ label: title }]" />
  <n-card>
    <n-alert type="warning" :show-icon="false">{{ hint }}</n-alert>
    <p class="muted">菜单入口与现网对齐，业务页在后续切片实现。</p>
  </n-card>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin-top: 12px;
}
</style>
