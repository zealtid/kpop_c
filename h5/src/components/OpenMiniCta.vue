<script setup lang="ts">
import { ref } from "vue";
import { copyText } from "../wechat";

const props = defineProps<{
  title?: string;
  path: string;
  urlScheme?: string | null;
  hint?: string;
}>();

const copied = ref(false);

function openMini() {
  if (props.urlScheme) {
    window.location.href = props.urlScheme;
    return;
  }
  copyPath();
  window.alert("请使用微信打开星卡小程序（可粘贴下方路径）");
}

async function copyPath() {
  try {
    await copyText(props.path);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    window.alert(props.path);
  }
}
</script>

<template>
  <button class="btn" type="button" @click="openMini">{{ title || "打开星卡小程序" }}</button>
  <div class="card" style="margin-top: 12px">
    <div class="muted">打不开时，复制路径到微信小程序搜索「星卡」后粘贴，或扫描分享图二维码。</div>
    <div class="path">{{ path }}</div>
    <button class="btn-ghost" type="button" @click="copyPath">{{ copied ? "已复制" : "复制小程序路径" }}</button>
    <p v-if="hint" class="muted">{{ hint }}</p>
  </div>
</template>

<style scoped>
.path {
  margin-top: 8px;
  word-break: break-all;
  font-size: 13px;
}
</style>
