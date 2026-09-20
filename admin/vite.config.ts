import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const api = process.env.VITE_API_PROXY || "http://127.0.0.1:3000";

export default defineConfig({
  // Production is served at https://www.zealhe.top/admin/. Keep `/` in `npm run dev`
  // so the `/admin` API proxy is not swallowed by the SPA base.
  base: process.env.NODE_ENV === "production" ? "/admin/" : "/",
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // Local `npm run dev` (base `/`) proxies all `/admin` API routes.
      // `vite preview` uses production base `/admin/` — skip the SPA entry and assets
      // so they are not sent to the API (same class of bug as H5 `/h5` preview).
      "/admin": {
        target: api,
        changeOrigin: true,
        bypass(req) {
          const url = req.url ?? "";
          if (
            url === "/admin" ||
            url === "/admin/" ||
            url.startsWith("/admin/index.html") ||
            url.startsWith("/admin/assets/")
          ) {
            return req.url;
          }
        },
      },
      "/catalog": { target: api, changeOrigin: true },
      "/media": { target: api, changeOrigin: true },
      "/health": { target: api, changeOrigin: true },
    },
  },
});
