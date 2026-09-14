<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, errorMessage, mediaUrl } from "../api";
import { isWeChatBrowser } from "../wechat";
import AuthBanner from "../components/AuthBanner.vue";
import WeChatGate from "../components/WeChatGate.vue";
import type { CatalogRelease, CatalogTemplate } from "../types";

const route = useRoute();
const release = ref<CatalogRelease | null>(null);
const templates = ref<CatalogTemplate[]>([]);
const error = ref("");
const id = computed(() => String(route.params.id || ""));

onMounted(async () => {
  if (!isWeChatBrowser()) return;
  const [rel, tpls] = await Promise.all([
    api<{ release: CatalogRelease }>(`/catalog/releases/${id.value}`),
    api<{ templates: CatalogTemplate[] }>(`/catalog/releases/${id.value}/templates`),
  ]);
  if (rel.status !== 200) {
    error.value = errorMessage(rel.body, "发行不存在或未发布");
    return;
  }
  release.value = rel.body.release;
  templates.value = tpls.status === 200 ? tpls.body.templates || [] : [];
});
</script>

<template>
  <WeChatGate v-if="!isWeChatBrowser()" />
  <div v-else class="page">
    <a :href="release ? `#/catalog/groups/${(release as { groupSlug?: string }).groupSlug || ''}` : '#/catalog'" class="muted">← 返回</a>
    <h1>{{ release?.titleZh || release?.title || "发行" }}</h1>
    <AuthBanner />
    <p v-if="error" class="warn">{{ error }}</p>
    <div class="grid">
      <a v-for="t in templates" :key="t.id" class="grid-item" :href="`#/catalog/templates/${t.id}`">
        <img :src="mediaUrl(t.mainImageUrl)" alt="" />
        <p>{{ t.memberNameEn || t.name }} · {{ t.version }}</p>
      </a>
    </div>
  </div>
</template>
