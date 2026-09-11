<script setup lang="ts">
import { NButton, NCard, NSpace } from "naive-ui";
import { computed } from "vue";
import { authUser } from "../auth";
import PageHeader from "../components/PageHeader.vue";

const greeting = computed(() => {
  const user = authUser.value;
  return user ? `${user.username} · ${user.role}` : "";
});
</script>

<template>
  <PageHeader title="首页" hint="已登录运营后台。图鉴 CRUD、导入、特典对照、完整度与反馈/工单已接入；情报仍为占位。" />
  <n-card>
    <p>当前账号 {{ greeting }}</p>
    <n-space>
      <n-button type="primary" @click="$router.push({ name: 'catalog', params: { tab: 'groups' } })">打开图鉴</n-button>
      <n-button @click="$router.push({ name: 'tickets' })">查看工单</n-button>
    </n-space>
  </n-card>
</template>
