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
      "/admin": { target: api, changeOrigin: true },
      "/catalog": { target: api, changeOrigin: true },
      "/media": { target: api, changeOrigin: true },
      "/health": { target: api, changeOrigin: true },
    },
  },
});
