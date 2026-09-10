<script setup lang="ts">
import { NButton, NSpace } from "naive-ui";

const props = defineProps<{
  status: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  act: [status: "published" | "draft" | "deprecated"];
}>();
</script>

<template>
  <n-space :size="6" :wrap="true">
    <n-button
      v-if="props.status !== 'published'"
      size="tiny"
      type="success"
      :disabled="pending"
      @click="emit('act', 'published')"
    >
      发布
    </n-button>
    <n-button
      v-if="props.status !== 'draft'"
      size="tiny"
      :disabled="pending"
      @click="emit('act', 'draft')"
    >
      撤回草稿
    </n-button>
    <n-button
      v-if="props.status !== 'deprecated'"
      size="tiny"
      type="error"
      :disabled="pending"
      @click="emit('act', 'deprecated')"
    >
      废弃
    </n-button>
  </n-space>
</template>
