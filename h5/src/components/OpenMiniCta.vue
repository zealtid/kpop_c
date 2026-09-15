<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import type { H5Bootstrap } from "../types";
import { copyText, tryOpenMiniPath, tryOpenUrlScheme } from "../wechat";

const props = defineProps<{
  title?: string;
  path: string;
  urlScheme?: string | null;
  hint?: string;
}>();

const copied = ref(false);
const fallbackHint = ref(false);
const scheme = ref(props.urlScheme || "");

onMounted(async () => {
  if (scheme.value) return;
  const res = await api<H5Bootstrap>("/h5/bootstrap");
  if (res.status === 200) {
    scheme.value = res.body.cta?.urlScheme || res.body.mini?.urlScheme || "";
  }
});

function openMini() {
  if (tryOpenMiniPath(props.path)) return;
  if (scheme.value) {
    tryOpenUrlScheme(scheme.value);
    window.setTimeout(() => {
      fallbackHint.value = true;
    }, 1600);
    return;
  }
  fallbackHint.value = true;
  copyPath();
}

async function copyPath() {
  try {
    await copyText(props.path);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    fallbackHint.value = true;
  }
}
</script>

<template>
  <button class="btn" type="button" @click="openMini">{{ title || "打开星卡小程序" }}</button>
  <div class="card" style="margin-top: 12px">
    <div class="muted">
      微信内打不开时：长按下方路径复制，打开微信搜索「星卡」小程序后粘贴到搜索框；或扫描分享图上的小程序码。
    </div>
    <div class="path" id="miniPath">{{ path }}</div>
    <button class="btn-ghost" type="button" @click="copyPath">{{ copied ? "已复制" : "复制小程序路径" }}</button>
    <p v-if="fallbackHint" class="muted">若未自动跳转，请用上方复制/长按路径，或扫描分享图二维码。</p>
    <p v-if="hint" class="muted">{{ hint }}</p>
  </div>
</template>

<style scoped>
.path {
  margin-top: 8px;
  word-break: break-all;
  font-size: 13px;
  user-select: all;
  -webkit-user-select: all;
}
</style>
