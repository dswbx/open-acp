import { applyVersionToRepo } from "./files.ts";

function parseVersionArg(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if ((token === "--version" || token === "-v") && value) {
      return value;
    }
  }

  throw new Error("Usage: bun ./scripts/release/apply-version.ts --version <version>");
}

async function main(): Promise<void> {
  const version = parseVersionArg(process.argv.slice(2));
  applyVersionToRepo(process.cwd(), version);
  process.stdout.write(`Applied version ${version}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
