<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, errorMessage, mediaUrl } from "../api";
import { isWeChatBrowser } from "../wechat";
import AuthBanner from "../components/AuthBanner.vue";
import OpenMiniCta from "../components/OpenMiniCta.vue";
import WeChatGate from "../components/WeChatGate.vue";
import type { CatalogTemplate } from "../types";

const route = useRoute();
const template = ref<CatalogTemplate | null>(null);
const error = ref("");
const showBack = ref(false);
const id = computed(() => String(route.params.id || ""));
const canFlip = computed(() => Boolean(template.value?.backImageUrl));
const image = computed(() => {
  const t = template.value;
  if (!t) return "";
  if (showBack.value && t.backImageUrl) return mediaUrl(t.backImageUrl);
  return mediaUrl(t.mainImageUrl);
});

onMounted(async () => {
  if (!isWeChatBrowser()) return;
  const res = await api<{ template: CatalogTemplate }>(`/catalog/templates/${id.value}`);
  if (res.status !== 200) {
    error.value = errorMessage(res.body, "卡片不存在或未发布");
    return;
  }
  template.value = res.body.template;
});
</script>

<template>
  <WeChatGate v-if="!isWeChatBrowser()" />
  <div v-else class="page">
    <a v-if="template?.releaseId" :href="`#/catalog/releases/${template.releaseId}`" class="muted">← 发行</a>
    <h1>{{ template?.memberNameZh || template?.memberNameEn || template?.name || "小卡" }}</h1>
    <p class="muted">{{ template?.releaseTitle }} · {{ template?.version }}</p>
    <AuthBanner />
    <p v-if="error" class="warn">{{ error }}</p>
    <img v-if="image" class="thumb" :src="image" alt="" />
    <button v-if="canFlip" class="btn-ghost" type="button" @click="showBack = !showBack">
      {{ showBack ? "看正面" : "看背面" }}
    </button>
    <OpenMiniCta
      v-if="template"
      :path="`pages/catalog-search/index?q=${encodeURIComponent(template.code || template.name)}`"
    />
  </div>
</template>
