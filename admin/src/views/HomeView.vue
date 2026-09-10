<script setup lang="ts">
import { NButton, NCard, NSpace } from "naive-ui";
import { computed } from "vue";
import { authUser } from "../auth";

const greeting = computed(() => {
  const user = authUser.value;
  return user ? `${user.username} · ${user.role}` : "";
});
</script>

<template>
  <n-card title="首页">
    <p>已登录运营后台。{{ greeting }}</p>
    <p class="muted">图鉴 CRUD、图鉴导入、特典对照、完整度看板与反馈/工单已接入；情报仍为占位。</p>
    <n-space>
      <n-button type="primary" @click="$router.push({ name: 'catalog', params: { tab: 'groups' } })">打开图鉴</n-button>
    </n-space>
  </n-card>
</template>

<style scoped>
.muted {
  color: var(--color-text-secondary);
}
</style>
