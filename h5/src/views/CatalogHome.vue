<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, errorMessage } from "../api";
import { isWeChatBrowser } from "../wechat";
import AuthBanner from "../components/AuthBanner.vue";
import WeChatGate from "../components/WeChatGate.vue";
import type { CatalogGroup } from "../types";

const router = useRouter();
const groups = ref<CatalogGroup[]>([]);
const error = ref("");
const q = ref("");

onMounted(async () => {
  if (!isWeChatBrowser()) return;
  const res = await api<{ groups: CatalogGroup[] }>("/catalog/groups");
  if (res.status !== 200) {
    error.value = errorMessage(res.body, "图鉴加载失败");
    return;
  }
  groups.value = res.body.groups || [];
});

function search() {
  router.push({ path: "/search", query: { q: q.value } });
}
</script>

<template>
  <WeChatGate v-if="!isWeChatBrowser()" />
  <div v-else class="page">
    <div class="brand">星卡图鉴</div>
    <h1>已发布组合</h1>
    <AuthBanner />
    <form @submit.prevent="search">
      <input v-model="q" class="search" placeholder="搜索成员 / 专辑 / 版本" />
    </form>
    <p v-if="error" class="warn">{{ error }}</p>
    <div class="list" style="margin-top: 16px">
      <a v-for="g in groups" :key="g.id" class="row" :href="`#/catalog/groups/${g.slug || g.id}`">
        <div>
          <strong>{{ g.nameZh }}</strong>
          <div class="muted">{{ g.nameEn }}</div>
        </div>
        <span class="muted">查看</span>
      </a>
    </div>
  </div>
</template>
