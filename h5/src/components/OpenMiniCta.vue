<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { api } from "../api";
import type { H5Bootstrap } from "../types";
import {
  copyText,
  isWeChatBrowser,
  setupWxOpenLaunch,
  tryOpenMiniPath,
  tryOpenUrlScheme,
} from "../wechat";

const props = defineProps<{
  title?: string;
  path: string;
  urlScheme?: string | null;
  urlLink?: string | null;
  hint?: string;
}>();

const copied = ref(false);
const fallbackHint = ref(false);
const scheme = ref(props.urlScheme || "");
const urlLink = ref(props.urlLink || "");
const ghId = ref("");
const missing = ref<string[]>([]);
const canJump = ref(false);
const jsSdkReady = ref(false);
const loadingJump = ref(true);
const openTagHost = ref<HTMLElement | null>(null);
let autoTried = false;

const missingLabel = computed(() => missing.value.filter(Boolean).join("、"));

watch(
  () => [props.urlScheme, props.urlLink],
  () => {
    if (props.urlScheme) scheme.value = props.urlScheme;
    if (props.urlLink) urlLink.value = props.urlLink;
  },
);

async function loadJump() {
  loadingJump.value = true;
  const res = await api<H5Bootstrap>(`/h5/bootstrap?path=${encodeURIComponent(props.path)}`);
  if (res.status === 200) {
    const body = res.body;
    scheme.value = body.cta?.urlScheme || body.mini?.urlScheme || scheme.value || "";
    urlLink.value = body.cta?.urlLink || body.mini?.urlLink || urlLink.value || "";
    ghId.value = body.cta?.ghId || body.mini?.ghId || "";
    missing.value = body.missing || body.cta?.missing || [];
    canJump.value = !!(body.canJump || urlLink.value || scheme.value);
    if (isWeChatBrowser() && body.jsSdk && ghId.value) {
      jsSdkReady.value = await setupWxOpenLaunch();
    }
  }
  loadingJump.value = false;
  await nextTick();
  mountOpenTag();
  maybeAutoOpen();
}

function mountOpenTag() {
  const el = openTagHost.value;
  if (!el || !jsSdkReady.value || !ghId.value) return;
  const label = props.title || "打开星卡小程序";
  const tplOpen = "<" + "script type=\"text/wxtag-template\">";
  const tplClose = "<" + "/script>";
  el.innerHTML = `<wx-open-launch-weapp username="${ghId.value}" path="${props.path.replace(/"/g, "")}" style="display:block;width:100%">
    ${tplOpen}<button style="width:100%;border:0;border-radius:12px;padding:14px 16px;font-size:16px;font-weight:600;background:#6B5CFF;color:#fff">${label}</button>${tplClose}
  </wx-open-launch-weapp>`;
}

function maybeAutoOpen() {
  if (autoTried || !isWeChatBrowser()) return;
  if (!urlLink.value && !scheme.value) return;
  autoTried = true;
  window.setTimeout(() => {
    attemptOpen(true);
  }, 350);
}

function attemptOpen(fromAuto = false) {
  if (tryOpenMiniPath(props.path)) return;
  const target = urlLink.value || scheme.value;
  if (target) {
    tryOpenUrlScheme(target);
    if (!fromAuto) {
      window.setTimeout(() => {
        fallbackHint.value = true;
      }, 1600);
    }
    return;
  }
  fallbackHint.value = true;
  if (!fromAuto) void copyPath();
}

function openMini() {
  if (urlLink.value) {
    window.location.href = urlLink.value;
    window.setTimeout(() => {
      fallbackHint.value = true;
    }, 1600);
    return;
  }
  attemptOpen(false);
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

onMounted(() => {
  void loadJump();
});
</script>

<template>
  <a v-if="urlLink && !jsSdkReady" class="btn" :href="urlLink">{{ title || "打开星卡小程序" }}</a>
  <button v-else-if="!jsSdkReady" class="btn" type="button" @click="openMini">{{ title || "打开星卡小程序" }}</button>
  <div v-show="jsSdkReady" ref="openTagHost" class="open-tag"></div>
  <div class="card" style="margin-top: 12px">
    <p v-if="!loadingJump && !canJump" class="warn">
      当前无法自动跳进小程序{{ missingLabel ? `（缺少 ${missingLabel}）` : "" }}。
      请在 Railway 的 api 服务配置 WX_SECRET（及可选 WX_MINI_GH_ID / 公众号 JS-SDK），或设置静态 WX_URL_SCHEME。
    </p>
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
.warn {
  color: #b54708;
  font-size: 13px;
  margin: 0 0 8px;
}
.open-tag {
  width: 100%;
}
</style>
