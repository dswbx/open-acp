import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("root index entry", () => {
  it("mounts the mainview app entry", () => {
    const html = readFileSync(
      resolve(process.cwd(), "index.html"),
      "utf8"
    );

    expect(html).toContain('./src/mainview/main.tsx');
    expect(html).not.toContain('/src/ui/main.tsx');
  });
});
