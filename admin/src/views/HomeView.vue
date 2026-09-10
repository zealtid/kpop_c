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
    <p class="muted">图鉴业务将在后续切片迁移；当前可从侧栏进入占位页。</p>
    <n-space>
      <n-button type="primary" @click="$router.push({ name: 'catalog' })">打开图鉴占位</n-button>
    </n-space>
  </n-card>
</template>

<style scoped>
.muted {
  color: #667085;
}
</style>
