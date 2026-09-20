import { createRouter, createWebHashHistory } from "vue-router";
import { ensureHydrated, isAuthed } from "../auth";

export const router = createRouter({
  // Production: https://www.zealhe.top/admin/#/... . Local `npm run dev` keeps `/`
  // (vite base is `/`) so the `/admin` API proxy still works.
  history: createWebHashHistory(import.meta.env.PROD ? "/admin/" : "/"),
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
          path: "submissions",
          name: "submissions",
          component: () => import("../views/SubmissionsListView.vue"),
        },
        {
          path: "submissions/:id",
          name: "submission-detail",
          component: () => import("../views/SubmissionDetailView.vue"),
        },
        {
          path: "users",
          name: "users",
          component: () => import("../views/UsersListView.vue"),
        },
        {
          path: "users/:id",
          name: "user-detail",
          component: () => import("../views/UserDetailView.vue"),
        },
        {
          path: "grid-vlm",
          name: "grid-vlm",
          component: () => import("../views/GridVlmView.vue"),
        },
        {
          path: "catalog/:tab?",
          name: "catalog",
          component: () => import("../views/CatalogView.vue"),
        },
        {
          path: "intel",
          name: "intel",
          component: () => import("../views/ComingSoonView.vue"),
          meta: { title: "情报", hint: "切片后续" },
        },
        {
          path: "tickets",
          name: "tickets",
          component: () => import("../views/TicketsListView.vue"),
        },
        {
          path: "tickets/:id",
          name: "ticket-detail",
          component: () => import("../views/TicketDetailView.vue"),
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
