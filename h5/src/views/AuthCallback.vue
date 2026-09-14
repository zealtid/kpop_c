<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { setToken } from "../api";
import { isWeChatBrowser } from "../wechat";

const route = useRoute();
const router = useRouter();

onMounted(() => {
  if (!isWeChatBrowser()) {
    router.replace("/");
    return;
  }
  const token = String(route.query.token || "");
  const next = String(route.query.next || "/catalog");
  if (token) setToken(token);
  router.replace(next.startsWith("/") ? next : "/catalog");
});
</script>

<template>
  <div class="page">
    <p class="muted">正在完成授权…</p>
  </div>
</template>
