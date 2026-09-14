import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const api = process.env.VITE_API_PROXY || "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      "/catalog": { target: api, changeOrigin: true },
      "/share": { target: api, changeOrigin: true },
      "/auth": { target: api, changeOrigin: true },
      "/me": { target: api, changeOrigin: true },
      "/h5": { target: api, changeOrigin: true },
      "/media": { target: api, changeOrigin: true },
      "/health": { target: api, changeOrigin: true },
    },
  },
});
