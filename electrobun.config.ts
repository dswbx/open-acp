import type { ElectrobunConfig } from "electrobun";
import { getReleaseBaseUrl } from "./scripts/release/updateFeed.ts";

const hasMacSigningEnv = Boolean(
  process.env.ELECTROBUN_DEVELOPER_ID &&
  process.env.ELECTROBUN_TEAMID &&
  process.env.ELECTROBUN_APPLEID &&
  process.env.ELECTROBUN_APPLEIDPASS,
);

export default {
  app: {
    name: "OpenACP",
    identifier: "dev.agentorchestrator.poc",
    version: "2026.9.0-beta.1",
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "src/bun/libMacWindowEffects.dylib": "bun/libMacWindowEffects.dylib",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
      codesign: hasMacSigningEnv,
      notarize: hasMacSigningEnv,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  release: {
    baseUrl: getReleaseBaseUrl(),
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
