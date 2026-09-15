<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorMessage, mediaUrl } from "../api";
import { isWeChatBrowser } from "../wechat";
import OpenMiniCta from "../components/OpenMiniCta.vue";
import type { ShareSummary } from "../types";

const route = useRoute();
const router = useRouter();
const summary = ref<ShareSummary | null>(null);
const error = ref("");
const loading = ref(true);

const g = computed(() => String(route.query.g || ""));
const r = computed(() => String(route.query.r || ""));
const t = computed(() => String(route.query.t || ""));

const title = computed(() => {
  const s = summary.value;
  if (!s) return "星卡";
  if (s.group) return s.group.nameZh;
  if (s.release) return s.release.titleZh || s.release.title;
  if (s.template) return `${s.template.memberNameZh || s.template.memberNameEn || ""} ${s.template.version}`.trim();
  return "星卡";
});

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  const params = new URLSearchParams();
  if (g.value) params.set("g", g.value);
  if (r.value) params.set("r", r.value);
  if (t.value) params.set("t", t.value);
  if (!params.toString()) {
    summary.value = null;
    loading.value = false;
    return;
  }
  const res = await api<ShareSummary>(`/share/summary?${params.toString()}`);
  loading.value = false;
  if (res.status !== 200) {
    error.value = errorMessage(res.body, "未找到已发布内容");
    return;
  }
  summary.value = res.body;
}

function browse() {
  const s = summary.value;
  if (!s) {
    router.push("/catalog");
    return;
  }
  if (s.template) {
    router.push(`/catalog/templates/${s.template.id}`);
    return;
  }
  if (s.release) {
    router.push(`/catalog/releases/${s.release.id}`);
    return;
  }
  if (s.group) {
    router.push(`/catalog/groups/${s.group.slug || s.group.id}`);
  }
}
</script>

<template>
  <div class="page">
    <div class="brand">星卡 · 小卡图鉴</div>
    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="warn">{{ error }}</p>
    <template v-else-if="summary">
      <div v-if="summary.group" class="group-ident" style="margin: 12px 0 8px">
        <img v-if="summary.group.iconUrl || summary.group.logoUrl" class="group-logo" :src="mediaUrl(summary.group.iconUrl || summary.group.logoUrl)" alt="" />
        <span v-else class="group-logo letter" :style="{ background: summary.group.logoColor || '#6b5cff' }">{{ (summary.group.nameZh || "?").slice(0, 1) }}</span>
        <h1 style="margin: 0">{{ title }}</h1>
      </div>
      <h1 v-else>{{ title }}</h1>
      <p v-if="summary.group" class="muted">
        {{ summary.group.publishedReleaseCount }} 个已发行 · {{ summary.group.publishedTemplateCount }} 张已发布小卡
      </p>
      <p v-else-if="summary.release" class="muted">
        {{ summary.release.groupNameZh }} · {{ summary.release.publishedTemplateCount }} 张已发布小卡
      </p>
      <p v-else-if="summary.template" class="muted">
        {{ summary.template.groupNameZh }} · {{ summary.template.releaseTitle }}
      </p>
      <p v-if="summary.group?.scopeNote" class="warn">{{ summary.group.scopeNote }}</p>
      <img
        v-if="summary.template?.mainImageUrl"
        class="thumb"
        :src="mediaUrl(summary.template.mainImageUrl)"
        alt=""
      />
      <div v-if="summary.group?.releases?.length" class="list" style="margin: 16px 0">
        <div v-for="item in summary.group.releases" :key="item.id" class="row">
          <strong>{{ item.titleZh || item.title }}</strong>
          <span class="muted">{{ item.releasedOn }}</span>
        </div>
      </div>
      <OpenMiniCta
        :title="summary.cta.title"
        :path="summary.mini.path"
        :url-scheme="summary.cta.urlScheme"
        :url-link="summary.cta.urlLink"
        :hint="summary.cta.hint"
      />
      <button v-if="isWeChatBrowser()" class="btn-ghost" type="button" @click="browse">在微信中浏览图鉴</button>
      <p v-else class="muted" style="margin-top: 16px">当前不是微信，仅展示已发布摘要。完整卡册请打开小程序。</p>
    </template>
    <template v-else>
      <h1>星卡</h1>
      <p class="muted">管理你的偶像小卡，浏览图鉴，生成卡册长图。</p>
      <OpenMiniCta path="pages/catalog/index" />
      <button v-if="isWeChatBrowser()" class="btn-ghost" type="button" @click="router.push('/catalog')">浏览已发布图鉴</button>
    </template>
  </div>
</template>
