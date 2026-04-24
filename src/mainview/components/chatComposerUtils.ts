export const DEFAULT_CHAT_COMPOSER_PLACEHOLDER = "Type a prompt. Use @ to mention files.";

const CODE_FENCE_PATTERN = /^(?:```|~~~)([\w-]+)?\s*$/;

export type ComposerEnterAction = "submit" | "convertFence" | "pass";

export interface ComposerEnterContext {
  key: string;
  shiftKey: boolean;
  selectionEmpty: boolean;
  parentNodeType: string;
  parentText: string;
  isAtEndOfBlock: boolean;
}

export function getChatComposerPlaceholder(placeholder?: string): string {
  return placeholder ?? DEFAULT_CHAT_COMPOSER_PLACEHOLDER;
}

export function parseCodeFenceLanguage(parentText: string): string | null {
  const match = parentText.trim().match(CODE_FENCE_PATTERN);
  if (!match) return null;
  return match[1] ?? "";
}

export function getComposerEnterAction({
  key,
  shiftKey,
  selectionEmpty,
  parentNodeType,
  parentText,
  isAtEndOfBlock,
}: ComposerEnterContext): ComposerEnterAction {
  if (key !== "Enter") {
    return "pass";
  }

  if (
    selectionEmpty &&
    parentNodeType === "paragraph" &&
    isAtEndOfBlock &&
    parseCodeFenceLanguage(parentText) !== null
  ) {
    return "convertFence";
  }

  if (parentNodeType === "codeBlock") {
    return "pass";
  }

  if (shiftKey) {
    return "pass";
  }

  return "submit";
}
