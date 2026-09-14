<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorMessage, mediaUrl } from "../api";
import { isWeChatBrowser } from "../wechat";
import AuthBanner from "../components/AuthBanner.vue";
import WeChatGate from "../components/WeChatGate.vue";
import type { CatalogTemplate } from "../types";

const route = useRoute();
const router = useRouter();
const q = ref(String(route.query.q || ""));
const templates = ref<CatalogTemplate[]>([]);
const empty = ref(false);
const error = ref("");

onMounted(search);

async function search() {
  if (!isWeChatBrowser()) return;
  router.replace({ query: { q: q.value } });
  const res = await api<{ templates: CatalogTemplate[]; empty: boolean }>(
    `/catalog/search?q=${encodeURIComponent(q.value)}`,
  );
  if (res.status !== 200) {
    error.value = errorMessage(res.body);
    return;
  }
  templates.value = res.body.templates || [];
  empty.value = !!res.body.empty;
}
</script>

<template>
  <WeChatGate v-if="!isWeChatBrowser()" />
  <div v-else class="page">
    <a href="#/catalog" class="muted">← 图鉴</a>
    <h1>搜索</h1>
    <AuthBanner />
    <form @submit.prevent="search">
      <input v-model="q" class="search" placeholder="ARIRANG / Carmen / 特典" />
    </form>
    <p v-if="error" class="warn">{{ error }}</p>
    <p v-else-if="empty" class="muted">没有已发布结果。缺卡反馈请在小程序提交。</p>
    <div class="grid" style="margin-top: 12px">
      <a v-for="t in templates" :key="t.id" class="grid-item" :href="`#/catalog/templates/${t.id}`">
        <img :src="mediaUrl(t.mainImageUrl)" alt="" />
        <p>{{ t.memberNameEn || t.name }} · {{ t.version }}</p>
      </a>
    </div>
  </div>
</template>
