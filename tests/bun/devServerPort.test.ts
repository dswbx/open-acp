import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  canListenOnPort,
  chooseAvailableDevServerPort,
  getConfiguredDevServerPort,
} from "../../src/bun/devServerPort.ts";

const servers: Server[] = [];

async function listenOnRandomPort(): Promise<number> {
  const server = createServer();
  servers.push(server);
  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a test port."));
        return;
      }
      resolve(address.port);
    });
  });
}

describe("dev server port selection", () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      ),
    );
  });

  it("uses the default dev server port when no override is configured", () => {
    expect(getConfiguredDevServerPort(undefined)).toBe(5173);
  });

  it("parses a configured dev server port", () => {
    expect(getConfiguredDevServerPort("54321")).toBe(54321);
  });

  it("rejects invalid configured dev server ports", () => {
    expect(() => getConfiguredDevServerPort("not-a-port")).toThrow(
      "Invalid OPENACP_DEV_SERVER_PORT value",
    );
  });

  it("skips common dev server ports in automatic mode", async () => {
    const randomPorts = [5173, 3000, 4173, 55000];
    const checkedPorts: number[] = [];

    await expect(
      chooseAvailableDevServerPort({
        randomPort: () => randomPorts.shift() ?? 55001,
        isPortAvailable: async (port) => {
          checkedPorts.push(port);
          return true;
        },
      }),
    ).resolves.toBe(55000);
    expect(checkedPorts).toEqual([55000]);
  });

  it("skips occupied ports in automatic mode", async () => {
    const checkedPorts: number[] = [];

    await expect(
      chooseAvailableDevServerPort({
        randomPort: () => (checkedPorts.length === 0 ? 55000 : 55001),
        isPortAvailable: async (port) => {
          checkedPorts.push(port);
          return port === 55001;
        },
      }),
    ).resolves.toBe(55001);
    expect(checkedPorts).toEqual([55000, 55001]);
  });

  it("fails clearly when an explicit port is occupied", async () => {
    await expect(
      chooseAvailableDevServerPort({
        explicitPort: "55000",
        isPortAvailable: async () => false,
      }),
    ).rejects.toThrow("OPENACP_DEV_SERVER_PORT 55000 is already in use");
  });

  it("detects an occupied loopback port", async () => {
    const port = await listenOnRandomPort();

    await expect(canListenOnPort(port)).resolves.toBe(false);
  });
});
