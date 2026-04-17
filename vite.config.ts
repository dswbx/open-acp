import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
   plugins: [react(), tailwindcss()],
   root: "src/mainview",
   build: {
      outDir: "../../dist",
      emptyOutDir: true,
   },
   server: {
      port: 5173,
      strictPort: true,
   },
   resolve: {
      alias: {
         "@": path.resolve(__dirname, "./src"),
      },
   },
});
