import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// ANALYZE=1 npm run build writes dist/bundle-report.html (rollup-plugin-
// visualizer) — a treemap of what's actually in each chunk, used to check
// that admin/agency dashboard code is split into its own lazy chunks
// rather than bleeding into the shared bundle every traveler downloads.
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    process.env.ANALYZE && visualizer({ filename: "dist/bundle-report.html", gzipSize: true, brotliSize: true }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
