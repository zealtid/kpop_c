import { createRouter, createWebHashHistory } from "vue-router";
import { ensureHydrated, isAuthed } from "../auth";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { guest: true },
    },
    {
      path: "/",
      component: () => import("../components/AppShell.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          name: "home",
          component: () => import("../views/HomeView.vue"),
        },
        {
          path: "catalog/:tab?",
          name: "catalog",
          component: () => import("../views/CatalogPlaceholderView.vue"),
        },
        {
          path: "intel",
          name: "intel",
          component: () => import("../views/ComingSoonView.vue"),
          meta: { title: "情报", hint: "切片后续" },
        },
        {
          path: "tickets/:id?",
          name: "tickets",
          component: () => import("../views/ComingSoonView.vue"),
          meta: { title: "反馈/工单", hint: "切片后续" },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  await ensureHydrated();
  const needsAuth = to.matched.some((record) => record.meta.requiresAuth);
  const isGuest = to.matched.some((record) => record.meta.guest);
  if (needsAuth && !isAuthed.value) {
    return { name: "login", query: to.path === "/" ? {} : { redirect: to.fullPath } };
  }
  if (isGuest && isAuthed.value) {
    return { name: "home" };
  }
  return true;
});
