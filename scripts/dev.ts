import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chooseAvailableDevServerPort } from "../src/bun/devServerPort.ts";

const WEB_ONLY_FLAG = "--web-only";
const DEV_SERVER_HOST = "127.0.0.1";
const WAIT_FOR_VITE_TIMEOUT_MS = 30000;
const SHUTDOWN_TIMEOUT_MS = 5000;

type ChildProcessEntry = {
  child: ChildProcess;
  exited: boolean;
};

const webOnly = process.argv.includes(WEB_ONLY_FLAG);
const children = new Set<ChildProcessEntry>();
let shuttingDown = false;

function getLocalBin(command: string): string {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return path.join(process.cwd(), "node_modules", ".bin", `${command}${extension}`);
}

function spawnLocalBin(name: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(getLocalBin(name), args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  const entry = { child, exited: false };
  children.add(entry);
  child.once("exit", () => {
    entry.exited = true;
    children.delete(entry);
  });
  return child;
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      resolve(signal ? 1 : 0);
    });
  });
}

function prepareElectrobunWatchDirectories(): void {
  const distDirectory = path.join(process.cwd(), "dist");
  mkdirSync(path.join(distDirectory, "assets"), { recursive: true });

  const indexPath = path.join(distDirectory, "index.html");
  if (!existsSync(indexPath)) {
    writeFileSync(
      indexPath,
      "<!doctype html><html><head><title>OpenACP Dev</title></head><body>Vite dev server unavailable.</body></html>\n",
      "utf8",
    );
  }
}

async function waitForVite(url: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_FOR_VITE_TIMEOUT_MS) {
    try {
      await fetch(url, { method: "HEAD" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for Vite at ${url}.`);
}

async function stopChildren(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  const runningChildren = Array.from(children);
  for (const { child } of runningChildren) {
    child.kill("SIGTERM");
  }

  await Promise.race([
    Promise.all(runningChildren.map(({ child }) => waitForExit(child))),
    new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
  ]);

  for (const { child, exited } of runningChildren) {
    if (!exited) {
      child.kill("SIGKILL");
    }
  }
}

async function run(): Promise<void> {
  const port = await chooseAvailableDevServerPort({
    explicitPort: process.env.OPENACP_DEV_SERVER_PORT,
  });
  const devServerUrl = `http://${DEV_SERVER_HOST}:${port}`;
  const env = {
    ...process.env,
    OPENACP_DEV_SERVER_HOST: DEV_SERVER_HOST,
    OPENACP_DEV_SERVER_PORT: String(port),
  };

  console.info(`Starting Vite on ${devServerUrl}`);
  const vite = spawnLocalBin(
    "vite",
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    env,
  );
  const viteExit = waitForExit(vite);

  if (webOnly) {
    process.exitCode = await viteExit;
    return;
  }

  await Promise.race([
    waitForVite(devServerUrl),
    viteExit.then((code) => {
      throw new Error(`Vite exited before it was ready with code ${code}.`);
    }),
  ]);

  prepareElectrobunWatchDirectories();
  console.info("Starting Electrobun desktop app");
  const electrobun = spawnLocalBin("electrobun", ["dev", "--watch"], env);
  const electrobunExit = waitForExit(electrobun);

  process.exitCode = await Promise.race([viteExit, electrobunExit]);
  await stopChildren();
}

process.once("SIGINT", () => {
  void stopChildren().then(() => {
    process.exit(130);
  });
});
process.once("SIGTERM", () => {
  void stopChildren().then(() => {
    process.exit(143);
  });
});

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  void stopChildren().then(() => {
    process.exit(1);
  });
});
