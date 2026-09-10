<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
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

function isActive(id: string) {
  if (id === "catalog") return route.name === "catalog" || route.path.startsWith("/catalog");
  if (id === "tickets") return route.name === "tickets" || route.name === "ticket-detail";
  return route.name === id || route.path === `/${id}` || route.path.startsWith(`/${id}/`);
}

function onMenuNavigate() {
  drawerOpen.value = false;
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
      <div class="brand">星卡 Admin</div>
      <nav class="side-nav" aria-label="主导航">
        <RouterLink
          v-for="item in menus"
          :key="item.id"
          :to="menuTo(item.id)"
          class="nav-item"
          :class="{ active: isActive(item.id) }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </n-layout-sider>

    <n-drawer v-model:show="drawerOpen" :width="260" placement="left">
      <n-drawer-content title="星卡 Admin" closable>
        <nav class="side-nav" aria-label="主导航">
          <RouterLink
            v-for="item in menus"
            :key="item.id"
            :to="menuTo(item.id)"
            class="nav-item"
            :class="{ active: isActive(item.id) }"
            @click="onMenuNavigate"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </n-drawer-content>
    </n-drawer>

    <n-layout>
      <n-layout-header bordered class="topbar">
        <div class="top-left">
          <n-button v-if="isNarrow" quaternary size="small" @click="drawerOpen = true">菜单</n-button>
          <span v-if="isNarrow" class="brand-inline">星卡 Admin</span>
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
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 8px 10px 16px;
}

.brand-inline {
  font-weight: 700;
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: block;
  text-decoration: none;
  color: var(--color-text-primary);
  padding: 10px 12px;
  border-radius: 8px;
}

.nav-item.active,
.nav-item:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 56px;
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
</style>
