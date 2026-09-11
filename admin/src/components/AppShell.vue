<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  type MenuOption,
} from "naive-ui";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { authUser, logout, userMenus } from "../auth";
import { useNarrow } from "../narrow";

const { isNarrow } = useNarrow();
const drawerOpen = ref(false);

watch(isNarrow, (narrow) => {
  if (!narrow) drawerOpen.value = false;
});

const route = useRoute();
const router = useRouter();

const who = computed(() => {
  const user = authUser.value;
  if (!user) return "";
  return `${user.username} · ${user.role}`;
});

const menus = computed(() => userMenus());

function menuTo(id: string) {
  if (id === "catalog") return { name: "catalog" as const, params: { tab: "groups" } };
  if (id === "intel") return { name: "intel" as const };
  if (id === "tickets") return { name: "tickets" as const };
  return { path: `/${id}` };
}

const activeKey = computed(() => {
  if (route.name === "catalog" || route.path.startsWith("/catalog")) return "catalog";
  if (route.name === "tickets" || route.name === "ticket-detail") return "tickets";
  if (route.name === "intel") return "intel";
  return String(route.name || "");
});

const menuOptions = computed<MenuOption[]>(() =>
  menus.value.map((item) => ({
    key: item.id,
    label: () =>
      h(
        RouterLink,
        { to: menuTo(item.id), class: "menu-link", onClick: onMenuNavigate },
        { default: () => item.label },
      ),
  })),
);

function onMenuNavigate() {
  drawerOpen.value = false;
}

function onMenuSelect(key: string) {
  onMenuNavigate();
  void router.push(menuTo(key));
}

async function onLogout() {
  await logout();
  await router.replace({ name: "login" });
}
</script>

<template>
  <n-layout class="shell" has-sider>
    <n-layout-sider
      v-if="!isNarrow"
      bordered
      :width="220"
      content-style="padding: 12px 10px;"
    >
      <RouterLink class="brand" :to="{ name: 'home' }">星卡 Admin</RouterLink>
      <n-menu :value="activeKey" :options="menuOptions" :indent="12" />
    </n-layout-sider>

    <n-drawer v-model:show="drawerOpen" :width="260" placement="left">
      <n-drawer-content title="星卡 Admin" closable>
        <n-menu :value="activeKey" :options="menuOptions" :indent="12" @update:value="onMenuSelect" />
      </n-drawer-content>
    </n-drawer>

    <n-layout>
      <n-layout-header bordered class="topbar">
        <div class="top-left">
          <n-button v-if="isNarrow" quaternary size="small" @click="drawerOpen = true">菜单</n-button>
          <RouterLink v-if="isNarrow" class="brand-inline" :to="{ name: 'home' }">星卡 Admin</RouterLink>
        </div>
        <div class="who">
          <span>{{ who }}</span>
          <n-button size="small" @click="onLogout">退出</n-button>
        </div>
      </n-layout-header>
      <n-layout-content class="content" content-style="padding: 20px;">
        <RouterView />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.brand {
  display: block;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 8px 10px 16px;
  text-decoration: none;
  color: var(--color-text-primary);
}

.brand-inline {
  font-weight: 700;
  text-decoration: none;
  color: var(--color-text-primary);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 56px;
  background: var(--color-bg-elevated);
}

.top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.content {
  background: var(--color-bg-page);
}

:deep(.menu-link) {
  display: block;
  color: inherit;
  text-decoration: none;
}
</style>
