import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../.github/workflows/ci.yml"),
  "utf8",
);

describe("release workflow", () => {
  it("runs the release path only for pushes to develop and main after CI gates pass", () => {
    expect(workflow).toContain("branches: [develop, main]");
    expect(workflow).toContain(
      "if: github.event_name == 'push' && (github.ref_name == 'develop' || github.ref_name == 'main')",
    );
    expect(workflow).toContain("needs: [typecheck, lint, test]");
  });

  it("uses computed branch metadata to select canary or stable packaging", () => {
    expect(workflow).toContain('bun run release:compute-version --branch "${GITHUB_REF_NAME}"');
    expect(workflow).toContain('bun run "${{ steps.version.outputs.build_script }}"');
    expect(workflow).toContain('if [ "$IS_PRERELEASE" = "true" ]; then');
    expect(workflow).toContain('release_args+=("--prerelease")');
  });

  it("publishes updater feeds for the computed canary or stable channel", () => {
    expect(workflow).toContain("needs: [release]");
    expect(workflow).toContain("CHANNEL_PREFIX: ${{ needs.release.outputs.build_env }}");
    expect(workflow).toContain('--channel-prefix "$CHANNEL_PREFIX"');
  });

  it("opens a main-to-develop sync PR after stable releases without auto-merging it", () => {
    expect(workflow).toContain("if: github.ref_name == 'main'");
    expect(workflow).toContain("gh pr list --base develop --head main --state open");
    expect(workflow).toContain("gh pr create \\");
    expect(workflow).toContain("--base develop \\");
    expect(workflow).toContain("--head main \\");
    expect(workflow).not.toContain("gh pr merge");
    expect(workflow).not.toContain("git push origin main:develop");
  });
});
