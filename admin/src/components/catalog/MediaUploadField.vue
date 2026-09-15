<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton, NInput } from "naive-ui";
import { mediaUrl } from "../../api";
import { uploadCatalogMedia, type PublicMediaKind } from "../../catalog/media";

const props = defineProps<{
  kind: PublicMediaKind;
  modelValue: string;
  placeholder?: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const busy = ref(false);
const err = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const preview = computed(() => mediaUrl(props.modelValue));

function pick() {
  fileInput.value?.click();
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  busy.value = true;
  err.value = "";
  try {
    const res = await uploadCatalogMedia(props.kind, file);
    if (!res.ok) {
      err.value = res.message;
      return;
    }
    emit("update:modelValue", res.path);
  } catch {
    err.value = "上传失败";
  } finally {
    busy.value = false;
  }
}

function clear() {
  emit("update:modelValue", "");
}
</script>

<template>
  <div class="media-field">
    <n-input
      :value="modelValue"
      :placeholder="placeholder || '/media/...'"
      @update:value="emit('update:modelValue', $event)"
    />
    <div class="row">
      <input
        ref="fileInput"
        class="file-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        @change="onFile"
      />
      <n-button size="small" :loading="busy" @click="pick">上传本地图</n-button>
      <n-button v-if="modelValue" size="small" quaternary @click="clear">清除</n-button>
    </div>
    <p v-if="err" class="err">{{ err }}</p>
    <img v-if="preview" class="preview" :class="{ compact }" :src="preview" alt="预览" />
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.err {
  color: var(--color-danger);
  font-size: 12px;
  margin: 6px 0 0;
}
.preview {
  width: 140px;
  height: 196px;
  object-fit: cover;
  border-radius: 8px;
  background: #eee;
  margin-top: 8px;
  display: block;
}
.preview.compact {
  width: 72px;
  height: 72px;
  border-radius: 16px;
}
</style>
