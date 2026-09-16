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
  <PageHeader
    title="首页"
    hint="已登录运营后台。官方图鉴小卡在「小卡维护」上传正/背图后发布。图鉴 CRUD、投稿审核、用户与贡献积分、导入、特典对照、完整度、反馈/工单与宫格识别统计已接入；情报仍为占位。"
  />
  <n-card>
    <p>当前账号 {{ greeting }}</p>
    <n-space wrap>
      <n-button type="primary" @click="$router.push({ name: 'catalog', params: { tab: 'templates' } })">
        小卡维护
      </n-button>
      <n-button type="primary" @click="$router.push({ name: 'catalog', params: { tab: 'groups' } })">打开图鉴</n-button>
      <n-button @click="$router.push({ name: 'catalog', params: { tab: 'benefits' } })">特典对照</n-button>
      <n-button @click="$router.push({ name: 'submissions' })">投稿审核</n-button>
      <n-button @click="$router.push({ name: 'users' })">用户</n-button>
      <n-button @click="$router.push({ name: 'grid-vlm' })">宫格识别</n-button>
      <n-button @click="$router.push({ name: 'tickets' })">查看工单</n-button>
    </n-space>
  </n-card>
</template>
