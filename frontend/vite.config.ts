import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin cookies in development: the browser talks to Vite, Vite forwards /api.
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: false },
    },
  },
});
