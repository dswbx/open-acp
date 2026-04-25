import type { ChatToolCallState } from "../../shared/AppRPC.ts";

export type FileChangeOperation = "add" | "delete" | "edit" | "mixed";

export interface FileChangeDiffTotals {
  additions: number;
  deletions: number;
}

export interface FileChangePresentation {
  verb: string;
  target: string;
  additions: number;
  deletions: number;
  diffText: string;
  operation: FileChangeOperation;
}

interface RawFileChange {
  path: string;
  kind?: unknown;
  diff: string;
}

interface NormalizedFileChange {
  path: string;
  label: string;
  operation: Exclude<FileChangeOperation, "mixed">;
  diff: string;
}

export interface FileChangePresentationInput {
  state?: ChatToolCallState;
  toolKind?: string;
  toolTitle?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function formatFileChangePresentation(
  input: FileChangePresentationInput,
): FileChangePresentation | undefined {
  const changes = extractFileChanges(input.output) ?? extractFileChanges(input.input);
  if (changes && changes.length > 0) {
    const operation = getOperation(changes);
    const diffText = changes.map(buildUnifiedDiff).join("\n\n");
    const totals = countDiffLines(diffText);
    const verb = getVerb(operation, getTense(input.state, input.errorText));
    const target = changes.length === 1 ? (changes[0]?.label ?? "file") : `${changes.length} files`;

    return {
      verb,
      target,
      additions: totals.additions,
      deletions: totals.deletions,
      diffText,
      operation,
    };
  }

  const qwenDiffChange = extractQwenDiffChange(input.output, input.input);
  if (qwenDiffChange) {
    const totals = countDiffLines(qwenDiffChange.diff);
    const verb = getVerb(qwenDiffChange.operation, getTense(input.state, input.errorText));
    return {
      verb,
      target: qwenDiffChange.label,
      additions: totals.additions,
      deletions: totals.deletions,
      diffText: qwenDiffChange.diff,
      operation: qwenDiffChange.operation,
    };
  }

  const diffText = extractGitDiffText(input.output) ?? extractGitDiffText(input.input);
  if (!diffText) {
    const activeChange = extractActiveFileMutation(input.input, input.toolTitle, input.toolKind);
    if (activeChange) {
      const diffText = activeChange.diff ? buildUnifiedDiff(activeChange) : "";
      const totals = diffText ? countDiffLines(diffText) : { additions: 0, deletions: 0 };
      const verb = getVerb(activeChange.operation, getTense(input.state, input.errorText));
      return {
        verb,
        target: activeChange.label,
        additions: totals.additions,
        deletions: totals.deletions,
        diffText,
        operation: activeChange.operation,
      };
    }

    const shellDelete = extractShellDelete(input.output);
    if (!shellDelete) {
      return undefined;
    }
    const verb = getVerb("delete", getTense(input.state, input.errorText));
    return {
      verb,
      target: shellDelete.label,
      additions: 0,
      deletions: 0,
      diffText: "",
      operation: "delete",
    };
  }

  const files = extractGitDiffFiles(diffText);
  if (files.length === 0) {
    return undefined;
  }

  const operation = getOperation(files);
  const totals = countDiffLines(diffText);
  const verb = getVerb(operation, getTense(input.state, input.errorText));
  const target = files.length === 1 ? (files[0]?.label ?? "file") : `${files.length} files`;

  return {
    verb,
    target,
    additions: totals.additions,
    deletions: totals.deletions,
    diffText,
    operation,
  };
}

export function formatFileChangeTitle(presentation: FileChangePresentation): string {
  const totals = ` +${presentation.additions} -${presentation.deletions}`;
  return `${presentation.verb} ${presentation.target}${isActiveVerb(presentation.verb) ? "" : totals}`;
}

function extractFileChanges(value: unknown): NormalizedFileChange[] | undefined {
  const rawChanges = getRawFileChanges(value);
  if (!rawChanges) {
    return undefined;
  }

  const changes = rawChanges
    .map((change): NormalizedFileChange | undefined => {
      if (typeof change.path !== "string" || typeof change.diff !== "string") {
        return undefined;
      }
      return {
        path: change.path,
        label: getBaseName(change.path),
        operation: normalizeOperation(change.kind),
        diff: change.diff,
      };
    })
    .filter((change): change is NormalizedFileChange => Boolean(change));

  return changes.length > 0 ? changes : undefined;
}

function getRawFileChanges(value: unknown): RawFileChange[] | undefined {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord) as unknown as RawFileChange[];
  }
  if (isRecord(parsed) && Array.isArray(parsed.changes)) {
    return parsed.changes.filter(isRecord) as unknown as RawFileChange[];
  }
  return undefined;
}

function extractGitDiffText(value: unknown): string | undefined {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (typeof value === "string" && value.trimStart().startsWith("diff --git ")) {
    return value.trimEnd();
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const diff = parsed.diff;
  if (typeof diff === "string" && diff.trimStart().startsWith("diff --git ")) {
    return diff.trimEnd();
  }
  return undefined;
}

function extractQwenDiffChange(output: unknown, input: unknown): NormalizedFileChange | undefined {
  const parsedOutput = typeof output === "string" ? parseJson(output) : output;
  if (!isRecord(parsedOutput) || typeof parsedOutput.fileDiff !== "string") {
    return undefined;
  }

  const fallbackPath = getPathFromValue(input);
  const fileName =
    getString(parsedOutput.fileName) ?? getString(parsedOutput.path) ?? fallbackPath ?? "file";
  const path = fallbackPath ?? fileName;
  const operation = normalizeQwenDiffOperation(parsedOutput);
  return {
    path,
    label: getBaseName(path),
    operation,
    diff: convertIndexDiffToGitDiff(parsedOutput.fileDiff, fileName, operation),
  };
}

function extractActiveFileMutation(
  input: unknown,
  toolTitle?: string,
  toolKind?: string,
): NormalizedFileChange | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const path = getPathFromValue(input);
  if (!path) {
    return undefined;
  }

  const oldString = getString(input.old_string);
  const newString = getString(input.new_string);
  if (oldString !== undefined || newString !== undefined) {
    return {
      path,
      label: getBaseName(path),
      operation: "edit",
      diff: "",
    };
  }

  const content = getString(input.content);
  const title = toolTitle?.toLowerCase() ?? "";
  const kind = toolKind?.toLowerCase() ?? "";
  if (content !== undefined && (title.includes("writefile") || kind.includes("write"))) {
    return {
      path,
      label: getBaseName(path),
      operation: "add",
      diff: content,
    };
  }

  return undefined;
}

function extractShellDelete(output: unknown): NormalizedFileChange | undefined {
  const text = extractText(output);
  if (!text) {
    return undefined;
  }
  const command = text.match(/^Command:\s*(.+)$/mu)?.[1]?.trim();
  if (!command) {
    return undefined;
  }
  const match = command.match(/(?:^|\s)rm\s+(?:-[^\s]+\s+)*(?<path>(?:"[^"]+"|'[^']+'|[^\s]+))$/u);
  const rawPath = match?.groups?.path;
  if (!rawPath) {
    return undefined;
  }
  const path = rawPath.replace(/^["']|["']$/gu, "");
  return {
    path,
    label: getBaseName(path),
    operation: "delete",
    diff: "",
  };
}

function extractGitDiffFiles(text: string): NormalizedFileChange[] {
  const chunks = text
    .split(/\n(?=diff --git )/u)
    .map((chunk) => chunk.trimEnd())
    .filter(Boolean);

  return chunks
    .map((chunk): NormalizedFileChange | undefined => {
      const header = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/mu);
      if (!header) {
        return undefined;
      }
      const oldPath = header[1] ?? "";
      const newPath = header[2] ?? oldPath;
      const path = chunk.includes("\n+++ /dev/null") ? oldPath : newPath;
      return {
        path,
        label: getBaseName(path),
        operation: normalizeGitDiffOperation(chunk),
        diff: chunk,
      };
    })
    .filter((change): change is NormalizedFileChange => Boolean(change));
}

function buildUnifiedDiff(change: NormalizedFileChange): string {
  const path = change.label;
  const body = change.diff.trimEnd();

  if (body.startsWith("diff --git ")) {
    return body;
  }

  if (change.operation === "add") {
    const lines = splitDiffBody(change.diff);
    return [
      `diff --git a/${path} b/${path}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
    ].join("\n");
  }

  if (change.operation === "delete") {
    const lines = splitDiffBody(change.diff);
    return [
      `diff --git a/${path} b/${path}`,
      "deleted file mode 100644",
      `--- a/${path}`,
      "+++ /dev/null",
      `@@ -1,${lines.length} +0,0 @@`,
      ...lines.map((line) => `-${line}`),
    ].join("\n");
  }

  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, body].join("\n");
}

function countDiffLines(text: string): FileChangeDiffTotals {
  let additions = 0;
  let deletions = 0;

  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

function getOperation(changes: readonly NormalizedFileChange[]): FileChangeOperation {
  const operations = new Set(changes.map((change) => change.operation));
  if (operations.size === 1) {
    return changes[0]?.operation ?? "edit";
  }
  return "mixed";
}

function normalizeOperation(kind: unknown): Exclude<FileChangeOperation, "mixed"> {
  const type = isRecord(kind) && typeof kind.type === "string" ? kind.type : String(kind ?? "");
  const normalized = type.toLowerCase();
  if (normalized === "add" || normalized === "create" || normalized === "created") {
    return "add";
  }
  if (normalized === "delete" || normalized === "remove" || normalized === "deleted") {
    return "delete";
  }
  return "edit";
}

function normalizeQwenDiffOperation(
  output: Record<string, unknown>,
): Exclude<FileChangeOperation, "mixed"> {
  const originalContent = getString(output.originalContent);
  const newContent = getString(output.newContent);
  if ((originalContent ?? "") === "" && (newContent ?? "") !== "") {
    return "add";
  }
  if ((originalContent ?? "") !== "" && (newContent ?? "") === "") {
    return "delete";
  }
  return normalizeGitDiffOperation(getString(output.fileDiff) ?? "");
}

function normalizeGitDiffOperation(chunk: string): Exclude<FileChangeOperation, "mixed"> {
  if (chunk.includes("\nnew file mode ") || chunk.includes("\n--- /dev/null")) {
    return "add";
  }
  if (chunk.includes("\ndeleted file mode ") || chunk.includes("\n+++ /dev/null")) {
    return "delete";
  }
  return "edit";
}

function convertIndexDiffToGitDiff(
  diff: string,
  fileName: string,
  operation: Exclude<FileChangeOperation, "mixed">,
): string {
  const path = getBaseName(fileName);
  if (diff.trimStart().startsWith("diff --git ")) {
    return diff.trimEnd();
  }

  const body = diff
    .trimEnd()
    .split(/\r?\n/u)
    .filter((line, index) => {
      if (index === 0 && line.startsWith("Index: ")) {
        return false;
      }
      return !/^=+$/u.test(line);
    })
    .map((line) => {
      if (line.startsWith("--- ")) {
        return operation === "add" ? "--- /dev/null" : `--- a/${path}`;
      }
      if (line.startsWith("+++ ")) {
        return operation === "delete" ? "+++ /dev/null" : `+++ b/${path}`;
      }
      return line;
    });

  return [
    `diff --git a/${path} b/${path}`,
    ...(operation === "add" ? ["new file mode 100644"] : []),
    ...(operation === "delete" ? ["deleted file mode 100644"] : []),
    ...body,
  ].join("\n");
}

function getTense(state?: ChatToolCallState, errorText?: string): "active" | "complete" | "error" {
  if (errorText || state === "output-error" || state === "output-denied") {
    return "error";
  }
  if (
    state === "input-available" ||
    state === "input-streaming" ||
    state === "approval-requested"
  ) {
    return "active";
  }
  return "complete";
}

function getVerb(operation: FileChangeOperation, tense: "active" | "complete" | "error"): string {
  if (tense === "error") {
    return operation === "add"
      ? "Failed creating"
      : operation === "delete"
        ? "Failed deleting"
        : "Failed editing";
  }
  if (operation === "add") {
    return tense === "active" ? "Creating" : "Created";
  }
  if (operation === "delete") {
    return tense === "active" ? "Deleting" : "Deleted";
  }
  if (operation === "mixed") {
    return tense === "active" ? "Changing" : "Changed";
  }
  return tense === "active" ? "Editing" : "Edited";
}

function isActiveVerb(verb: string): boolean {
  return verb === "Creating" || verb === "Editing" || verb === "Deleting" || verb === "Changing";
}

function splitDiffBody(value: string): string[] {
  const lines = value.split(/\r?\n/u);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function getBaseName(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function getPathFromValue(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return getString(value.file_path) ?? getString(value.path) ?? getString(value.filename);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => (isRecord(item) ? extractText(item.content ?? item) : ""))
      .join("");
    return text.length > 0 ? text : undefined;
  }
  if (isRecord(value)) {
    const directText = getString(value.text);
    if (directText) {
      return directText;
    }
    const content = value.content;
    if (isRecord(content)) {
      return getString(content.text);
    }
    if (Array.isArray(content)) {
      const text = content
        .map((item) => (isRecord(item) ? extractText(item.content ?? item) : ""))
        .join("");
      return text.length > 0 ? text : undefined;
    }
  }
  return undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
