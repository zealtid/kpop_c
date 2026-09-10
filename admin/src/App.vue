<script setup lang="ts">
import { NConfigProvider, NMessageProvider } from "naive-ui";
import { naiveThemeOverrides } from "./theme";
</script>

<template>
  <n-config-provider :theme-overrides="naiveThemeOverrides">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>
