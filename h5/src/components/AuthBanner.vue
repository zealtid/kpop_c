<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, apiBase, getToken } from "../api";
import { isWeChatBrowser } from "../wechat";
import type { H5Bootstrap } from "../types";

const route = useRoute();
const authed = ref(Boolean(getToken()));
const bootstrap = ref<H5Bootstrap | null>(null);

onMounted(async () => {
  const res = await api<H5Bootstrap>("/h5/bootstrap");
  if (res.status === 200) bootstrap.value = res.body;
});

function authorize() {
  const next = encodeURIComponent(route.fullPath || "/catalog");
  window.location.href = `${apiBase()}/auth/wx-web/start?returnTo=${next}`;
}
</script>

<template>
  <div v-if="isWeChatBrowser() && !authed && bootstrap?.webOAuth" class="banner">
    授权后与小程序使用同一账号（需开放平台 unionId）。未授权也可只读浏览已发布图鉴。
    <button class="btn-ghost" type="button" style="padding: 8px 0 0" @click="authorize">微信授权浏览</button>
  </div>
</template>
