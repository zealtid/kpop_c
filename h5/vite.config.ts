import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const api = process.env.VITE_API_PROXY || "http://127.0.0.1:3000";

export default defineConfig({
  // Production is served at https://zealhe.top/h5/. Keep `/` in `npm run dev`
  // so the `/h5` proxy (API bootstrap / jssdk) is not swallowed by the SPA base.
  base: process.env.NODE_ENV === "production" ? "/h5/" : "/",
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("wx-open-launch-"),
        },
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      "/catalog": { target: api, changeOrigin: true },
      "/share": { target: api, changeOrigin: true },
      "/auth": { target: api, changeOrigin: true },
      "/me": { target: api, changeOrigin: true },
      // Only API routes — not the whole `/h5` prefix (production SPA lives there).
      "/h5/bootstrap": { target: api, changeOrigin: true },
      "/h5/jssdk-config": { target: api, changeOrigin: true },
      "/media": { target: api, changeOrigin: true },
      "/health": { target: api, changeOrigin: true },
    },
  },
});
