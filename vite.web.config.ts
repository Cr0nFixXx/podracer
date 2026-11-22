// Second build next to the single file (user decision 2026-11-22): `npm run build:web` → build/ – many files, for a web server
// (Vercel, GitHub Pages, any static host). Code and every texture are files of their own: the browser fetches a texture only when a
// track needs it and keeps everything in its cache. It does NOT run by double click (file://) – that is what `npm run build` →
// dist/index.html is for. `vite.config.ts` (the single file) stays untouched.
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./", // relative addresses: the folder works at a domain root and in any sub-folder (GitHub Pages project page)
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    outDir: "build", // (a folder name the sandbox does not count towards its storage limit; git ignores it)
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // three.js and React change rarely: in chunks of their own they stay in the browser cache when only the game changes
        manualChunks: (id: string) => (id.includes("/node_modules/three/") ? "three" : /\/node_modules\/(react|react-dom|scheduler)\//.test(id) ? "react" : undefined),
      },
    },
  },
  preview: { port: 4173 },
});
