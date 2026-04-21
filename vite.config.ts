import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { SessionTranscriptStore } from "./src/bun/SessionTranscriptStore.ts";

const sessionTranscriptStore = new SessionTranscriptStore();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "open-acp-session-recording",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/__open-acp/session-recording", async (request, response) => {
          const requestUrl = new URL(request.url ?? "", "http://localhost");
          const sessionId = requestUrl.searchParams.get("sessionId")?.trim();
          if (!sessionId) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: "Missing sessionId." }));
            return;
          }

          try {
            const recording = await sessionTranscriptStore.readRecording(process.cwd(), sessionId);
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify(recording));
          } catch (error) {
            response.statusCode = 404;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : `Session recording ${sessionId} was not found.`,
              }),
            );
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
