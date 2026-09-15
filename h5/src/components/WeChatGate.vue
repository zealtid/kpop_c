<script setup lang="ts">
import OpenMiniCta from "./OpenMiniCta.vue";

defineProps<{
  path?: string;
  urlScheme?: string | null;
  urlLink?: string | null;
}>();
</script>

<template>
  <div class="page">
    <div class="brand">星卡</div>
    <h1>请使用微信打开</h1>
    <p class="muted">网页版仅在微信内提供只读图鉴浏览。其他浏览器只展示分享摘要，不提供登录或写入。</p>
    <OpenMiniCta :path="path || 'pages/catalog/index'" :url-scheme="urlScheme" :url-link="urlLink" />
  </div>
</template>
