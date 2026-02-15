import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080, // Used in dev when Electron loads from dev server
  },
  build: {
    outDir: "dist",       // 🔥 Electron will load from this in production
    emptyOutDir: true,    // Clean old builds
    sourcemap: true,      // Optional: helpful for debugging in Electron
    base: './',
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
