import { describe, vi } from "vitest";

process.env.OPENACP_BUN_TEST = "1";

const viCompat = vi as typeof vi & {
  hoisted?: <T>(factory: () => T) => T;
  resetModules?: () => void;
};

viCompat.hoisted ??= (factory) => factory();
viCompat.resetModules ??= () => {};

const describeCompat = describe as typeof describe & {
  sequential?: typeof describe;
};

describeCompat.sequential ??= describe;
