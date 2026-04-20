import type { BrowserWindow } from "electrobun/bun";
import type { AppTestAction, AppTestWaitForStateParams } from "../shared/e2e.ts";
import type { ReplayFixtureHarness } from "./e2eHarness.ts";

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.trim().length === 0 ? {} : JSON.parse(text);
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function callRenderer<T>(
  mainWindow: BrowserWindow<any> | undefined,
  fn: (window: BrowserWindow<any>) => Promise<T>,
): Promise<T> {
  if (!mainWindow) {
    throw new Error("Main window is not available yet.");
  }
  return fn(mainWindow);
}

export function startE2EControlServer(params: {
  port: number;
  replayHarness: ReplayFixtureHarness;
  getMainWindow: () => BrowserWindow<any> | undefined;
}): void {
  Bun.serve({
    port: params.port,
    fetch: async (request) => {
      const url = new URL(request.url);

      try {
        if (request.method === "GET" && url.pathname === "/health") {
          return jsonResponse({
            ok: true,
            fixtureName: params.replayHarness.currentFixtureName,
          });
        }

        if (request.method === "POST" && url.pathname === "/fixture/load") {
          const body = (await readJsonBody(request)) as { fixtureName?: string };
          if (!body.fixtureName) {
            return jsonResponse(
              {
                ok: false,
                error: "fixtureName is required.",
              },
              { status: 400 },
            );
          }

          const metadata = await params.replayHarness.loadFixture(body.fixtureName);
          return jsonResponse({
            ok: true,
            metadata,
          });
        }

        if (request.method === "POST" && url.pathname === "/fixture/reset") {
          params.replayHarness.resetRuntimeState();
          return jsonResponse({
            ok: true,
          });
        }

        if (request.method === "GET" && url.pathname === "/renderer/snapshot") {
          const snapshot = await callRenderer(params.getMainWindow(), (window) =>
            window.webview.rpc.request.getTestSnapshot({}),
          );
          return jsonResponse({
            ok: true,
            snapshot,
          });
        }

        if (request.method === "POST" && url.pathname === "/renderer/wait") {
          const body = (await readJsonBody(request)) as AppTestWaitForStateParams;
          const snapshot = await callRenderer(params.getMainWindow(), (window) =>
            window.webview.rpc.request.waitForTestState(body),
          );
          return jsonResponse({
            ok: true,
            snapshot,
          });
        }

        if (request.method === "POST" && url.pathname === "/renderer/action") {
          const body = (await readJsonBody(request)) as AppTestAction;
          const snapshot = await callRenderer(params.getMainWindow(), (window) =>
            window.webview.rpc.request.performTestAction(body),
          );
          return jsonResponse({
            ok: true,
            snapshot,
          });
        }

        return jsonResponse(
          {
            ok: false,
            error: `Unknown route: ${request.method} ${url.pathname}`,
          },
          { status: 404 },
        );
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 500 },
        );
      }
    },
  });
}
