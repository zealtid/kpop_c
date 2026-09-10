<script setup lang="ts">
import { NConfigProvider, NMessageProvider, type GlobalThemeOverrides } from "naive-ui";

/** 与小程序 `styles/theme.wxss` Scheme A 同源，勿另起色板。 */
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#6B5CFF",
    primaryColorHover: "#5A4BE0",
    primaryColorPressed: "#5A4BE0",
    primaryColorSuppl: "#6B5CFF",
    bodyColor: "#F4F5F9",
    cardColor: "#FFFFFF",
    textColorBase: "#1A1B1F",
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
