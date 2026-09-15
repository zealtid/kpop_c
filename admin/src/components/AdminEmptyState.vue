<script setup lang="ts">
defineProps<{
  copy: string;
}>();
</script>

<template>
  <div class="admin-empty">
    <p class="copy">{{ copy }}</p>
    <div v-if="$slots.default" class="cta">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.admin-empty {
  padding: 28px 8px;
  text-align: center;
}

.copy {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.cta {
  margin-top: 12px;
}
</style>
