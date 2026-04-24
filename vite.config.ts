import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  build: {
    target: "es2021",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          charts: ["recharts"],
          markdown: ["react-markdown", "remark-gfm"],
        },
      },
    },
  },

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Ignore Tauri's Rust source and git worktrees. Without the worktree
      // exclusion, parallel branch development under .worktrees/ causes
      // constant full-page reloads in the dev server.
      ignored: ["**/src-tauri/**", "**/.worktrees/**", "**/.superpowers/**"],
    },
  },
}));
