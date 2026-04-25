import { randomInt } from "node:crypto";
import { createServer } from "node:net";

export const DEFAULT_DEV_SERVER_PORT = 5173;
export const RANDOM_DEV_SERVER_PORT_MIN = 49152;
export const RANDOM_DEV_SERVER_PORT_MAX = 65535;
export const COMMON_DEV_SERVER_PORTS = new Set([3000, 4173, 5173]);

type IsPortAvailable = (port: number) => Promise<boolean>;
type RandomPort = () => number;

export interface ChooseAvailableDevServerPortOptions {
  explicitPort?: string | undefined;
  isPortAvailable?: IsPortAvailable;
  maxAttempts?: number;
  randomPort?: RandomPort;
}

export function getConfiguredDevServerPort(value: string | undefined): number {
  if (!value?.trim()) {
    return DEFAULT_DEV_SERVER_PORT;
  }
  return parseDevServerPort(value);
}

export function parseDevServerPort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || String(port) !== value.trim() || port < 1 || port > 65535) {
    throw new Error(`Invalid OPENACP_DEV_SERVER_PORT value: ${value}`);
  }
  return port;
}

export function createRandomDevServerPort(): number {
  return randomInt(RANDOM_DEV_SERVER_PORT_MIN, RANDOM_DEV_SERVER_PORT_MAX + 1);
}

export async function canListenOnPort(port: number, host = "127.0.0.1"): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

export async function chooseAvailableDevServerPort(
  options: ChooseAvailableDevServerPortOptions = {},
): Promise<number> {
  const isPortAvailable = options.isPortAvailable ?? canListenOnPort;
  const explicitPort = options.explicitPort?.trim();
  if (explicitPort) {
    const port = parseDevServerPort(explicitPort);
    if (!(await isPortAvailable(port))) {
      throw new Error(`OPENACP_DEV_SERVER_PORT ${port} is already in use.`);
    }
    return port;
  }

  const maxAttempts = options.maxAttempts ?? 100;
  const randomPort = options.randomPort ?? createRandomDevServerPort;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = randomPort();
    if (COMMON_DEV_SERVER_PORTS.has(port)) {
      continue;
    }
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Failed to find an available dev server port after ${maxAttempts} attempts.`);
}
