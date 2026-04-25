import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { SessionTranscriptStore } from "./src/bun/SessionTranscriptStore.ts";
import { getConfiguredDevServerPort } from "./src/bun/devServerPort.ts";
import { readRecordedToolCalls } from "./src/bun/toolCallGalleryStore.ts";

const sessionTranscriptStore = new SessionTranscriptStore();
const devServerPort = getConfiguredDevServerPort(process.env.OPENACP_DEV_SERVER_PORT);

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
    {
      name: "open-acp-tool-call-gallery",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use("/__open-acp/tool-calls", async (_request, response) => {
          try {
            const toolCalls = await readRecordedToolCalls(process.cwd());
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify(toolCalls));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(
              JSON.stringify({
                generatedAt: new Date().toISOString(),
                sessions: [],
                toolCalls: [],
                warnings: [
                  {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to read recorded tool calls.",
                  },
                ],
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
  // Packaged Electrobun builds load from views://mainview/index.html, so assets
  // must stay relative instead of resolving from the protocol root.
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: devServerPort,
    strictPort: true,
  },
});
