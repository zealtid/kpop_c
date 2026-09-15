<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { fetchAuthedMediaObjectUrl } from "../api";

const props = defineProps<{
  srcPath?: string | null;
  adminMediaPath?: string | null;
  alt?: string;
  compact?: boolean;
}>();

const objectUrl = ref("");
const failed = ref(false);
const loading = ref(false);
const absoluteFallback = computed(() =>
  props.srcPath && /^https?:\/\//i.test(props.srcPath) ? props.srcPath : "",
);

async function load() {
  loading.value = true;
  failed.value = false;
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = "";
  }
  const candidates = [props.adminMediaPath, props.srcPath].filter((p): p is string => !!p);
  for (const path of candidates) {
    const url = await fetchAuthedMediaObjectUrl(path);
    if (url) {
      objectUrl.value = url;
      loading.value = false;
      return;
    }
  }
  failed.value = candidates.length > 0;
  loading.value = false;
}

watch(
  () => [props.adminMediaPath, props.srcPath],
  () => {
    void load();
  },
  { immediate: true },
);

onUnmounted(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div class="wrap" :class="{ compact }">
    <img v-if="objectUrl" class="preview" :src="objectUrl" :alt="alt || ''" />
    <img
      v-else-if="absoluteFallback"
      class="preview"
      :src="absoluteFallback"
      :alt="alt || ''"
    />
    <div v-else class="preview ph">{{ failed ? "图片加载失败" : "加载中…" }}</div>
  </div>
</template>

<style scoped>
.wrap {
  display: inline-block;
}
.preview {
  width: 140px;
  height: 196px;
  object-fit: cover;
  border-radius: 8px;
  background: #eee;
  display: block;
}
.compact .preview {
  width: 40px;
  height: 56px;
  border-radius: 4px;
}
.ph {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a8494;
  font-size: 12px;
  text-align: center;
  padding: 8px;
}
.compact .ph {
  font-size: 10px;
  padding: 2px;
}
</style>
