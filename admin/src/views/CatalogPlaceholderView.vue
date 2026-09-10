<script setup lang="ts">
import { NAlert, NCard } from "naive-ui";
</script>

<template>
  <n-card title="图鉴">
    <n-alert type="info" :show-icon="false">图鉴即将迁移</n-alert>
    <p class="muted">现网 `#/catalog/...` 入口保留，CRUD 在后续切片接入，本页不调用业务 API。</p>
  </n-card>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
  margin-top: 12px;
}
</style>
