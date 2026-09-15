<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, errorMessage, mediaUrl } from "../api";
import { isWeChatBrowser } from "../wechat";
import AuthBanner from "../components/AuthBanner.vue";
import WeChatGate from "../components/WeChatGate.vue";
import type { CatalogGroup, CatalogRelease } from "../types";

const route = useRoute();
const group = ref<CatalogGroup | null>(null);
const releases = ref<CatalogRelease[]>([]);
const error = ref("");

const id = computed(() => String(route.params.id || ""));

function releaseTitle(r: CatalogRelease) {
  return r.titleZh || r.title_zh || r.title;
}

function releasedOn(r: CatalogRelease) {
  const raw = r.releasedOn || r.released_on;
  return raw ? String(raw).slice(0, 10) : "";
}

onMounted(async () => {
  if (!isWeChatBrowser()) return;
  const res = await api<{ group: CatalogGroup; releases: CatalogRelease[] }>(`/catalog/groups/${id.value}`);
  if (res.status !== 200) {
    error.value = errorMessage(res.body, "组合不存在或未发布");
    return;
  }
  group.value = res.body.group;
  releases.value = res.body.releases || [];
});
</script>

<template>
  <WeChatGate v-if="!isWeChatBrowser()" />
  <div v-else class="page">
    <a href="#/catalog" class="muted">← 图鉴</a>
    <div class="group-ident" style="margin: 12px 0 8px">
      <img v-if="group?.iconUrl || group?.logoUrl" class="group-logo" :src="mediaUrl(group.iconUrl || group.logoUrl)" alt="" />
      <span v-else-if="group" class="group-logo letter" :style="{ background: group.logoColor || '#6b5cff' }">{{ (group.nameZh || group.nameEn || "?").slice(0, 1) }}</span>
      <h1 style="margin: 0">{{ group?.nameZh || "组合" }}</h1>
    </div>
    <p v-if="group?.scopeNote" class="warn">{{ group.scopeNote }}</p>
    <AuthBanner />
    <p v-if="error" class="warn">{{ error }}</p>
    <div class="list">
      <a v-for="r in releases" :key="r.id" class="row" :href="`#/catalog/releases/${r.id}`">
        <div>
          <strong>{{ releaseTitle(r) }}</strong>
          <div class="muted">{{ releasedOn(r) }}</div>
        </div>
        <span class="muted">{{ r.kind || "" }}</span>
      </a>
    </div>
  </div>
</template>
