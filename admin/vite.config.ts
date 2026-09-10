import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const api = process.env.VITE_API_PROXY || "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/admin": { target: api, changeOrigin: true },
      "/catalog": { target: api, changeOrigin: true },
      "/health": { target: api, changeOrigin: true },
    },
  },
});
