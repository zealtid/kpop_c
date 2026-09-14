import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "landing", component: () => import("./views/ShareLanding.vue") },
    { path: "/catalog", name: "catalog", component: () => import("./views/CatalogHome.vue") },
    { path: "/catalog/groups/:id", name: "group", component: () => import("./views/GroupDetail.vue") },
    { path: "/catalog/releases/:id", name: "release", component: () => import("./views/ReleaseDetail.vue") },
    { path: "/catalog/templates/:id", name: "template", component: () => import("./views/TemplateDetail.vue") },
    { path: "/search", name: "search", component: () => import("./views/SearchView.vue") },
    { path: "/auth", name: "auth", component: () => import("./views/AuthCallback.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});
