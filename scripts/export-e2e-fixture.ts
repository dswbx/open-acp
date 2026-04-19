import path from "node:path";
import { exportReplayFixture } from "../src/e2e/exportReplayFixture.ts";

interface ParsedArgs {
  inputDirectory: string;
  outputDirectory: string;
  fixtureName: string;
  description?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed = {
    inputDirectory: "",
    outputDirectory: "",
    fixtureName: "",
    description: undefined as string | undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--input" && value) {
      parsed.inputDirectory = value;
      index += 1;
      continue;
    }
    if (token === "--output" && value) {
      parsed.outputDirectory = value;
      index += 1;
      continue;
    }
    if (token === "--name" && value) {
      parsed.fixtureName = value;
      index += 1;
      continue;
    }
    if (token === "--description" && value) {
      parsed.description = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete flag: ${token}`);
  }

  if (!parsed.inputDirectory || !parsed.outputDirectory || !parsed.fixtureName) {
    throw new Error(
      "Usage: tsx scripts/export-e2e-fixture.ts --input <session-dir> --output <fixture-dir> --name <fixture-name> [--description <text>]",
    );
  }

  return {
    inputDirectory: path.resolve(parsed.inputDirectory),
    outputDirectory: path.resolve(parsed.outputDirectory),
    fixtureName: parsed.fixtureName,
    description: parsed.description,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await exportReplayFixture(args);
  process.stdout.write(
    `Exported ${result.events.length} replay events to ${args.outputDirectory}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
