<script setup lang="ts">
import { NConfigProvider, NMessageProvider, type GlobalThemeOverrides } from "naive-ui";

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#c45c7a",
    primaryColorHover: "#d47890",
    primaryColorPressed: "#a84864",
    primaryColorSuppl: "#c45c7a",
    borderRadius: "8px",
  },
};
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>
