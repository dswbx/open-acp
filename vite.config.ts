import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
