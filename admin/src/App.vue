<script setup lang="ts">
import { NConfigProvider, NMessageProvider, zhCN, dateZhCN } from "naive-ui";
import { naiveThemeOverrides } from "./theme";
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="naiveThemeOverrides">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>
