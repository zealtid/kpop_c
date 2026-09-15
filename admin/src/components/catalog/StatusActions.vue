<script setup lang="ts">
import { computed } from "vue";
import { NButton, NDropdown, type DropdownOption } from "naive-ui";

const props = withDefaults(
  defineProps<{
    status: string;
    pending?: boolean;
    size?: "tiny" | "small" | "medium";
  }>(),
  { size: "small" },
);

const emit = defineEmits<{
  act: [status: "published" | "draft" | "deprecated"];
}>();

const options = computed<DropdownOption[]>(() => {
  const items: DropdownOption[] = [];
  if (props.status !== "published") items.push({ label: "发布", key: "published" });
  if (props.status !== "draft") items.push({ label: "撤回草稿", key: "draft" });
  if (props.status !== "deprecated") items.push({ label: "废弃", key: "deprecated" });
  return items;
});

function onSelect(key: string | number) {
  if (key === "published" || key === "draft" || key === "deprecated") {
    emit("act", key);
  }
}
</script>

<template>
  <n-dropdown trigger="click" :options="options" :disabled="pending || !options.length" @select="onSelect">
    <n-button :size="size" :disabled="pending || !options.length">状态</n-button>
  </n-dropdown>
</template>
