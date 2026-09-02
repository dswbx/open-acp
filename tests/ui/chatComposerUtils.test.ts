import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_COMPOSER_PLACEHOLDER,
  getChatComposerPlaceholder,
  getComposerEnterAction,
  parseCodeFenceLanguage,
  type ComposerEnterContext,
} from "../../src/mainview/components/chatComposerUtils.ts";

const baseContext: ComposerEnterContext = {
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  selectionEmpty: true,
  parentNodeType: "paragraph",
  parentText: "",
  isAtEndOfBlock: true,
  isMultiline: false,
  requireCmdEnterForLongPrompts: false,
};

describe("chatComposerUtils", () => {
  it("uses the default composer placeholder when none is provided", () => {
    expect(getChatComposerPlaceholder()).toBe(DEFAULT_CHAT_COMPOSER_PLACEHOLDER);
  });

  it("detects code fence starters with and without a language", () => {
    expect(parseCodeFenceLanguage("```")).toBe("");
    expect(parseCodeFenceLanguage("```ts")).toBe("ts");
    expect(parseCodeFenceLanguage("~~~bash")).toBe("bash");
    expect(parseCodeFenceLanguage("hello")).toBeNull();
  });

  it("converts a fence starter instead of submitting the composer", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentText: "```ts",
      }),
    ).toBe("convertFence");
  });

  it("also converts a fence starter on Shift+Enter", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        shiftKey: true,
        parentText: "```ts",
      }),
    ).toBe("convertFence");
  });

  it("lets Enter stay inside code blocks", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentNodeType: "codeBlock",
        parentText: "const x = 1;",
      }),
    ).toBe("pass");
  });

  it("submits normal Enter presses in regular paragraphs", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentText: "hello world",
      }),
    ).toBe("submit");
  });

  it("requires ⌘+Enter for multiline prompts when the setting is enabled", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentText: "second line",
        isMultiline: true,
        requireCmdEnterForLongPrompts: true,
      }),
    ).toBe("pass");
  });

  it("submits multiline prompts with ⌘+Enter when the setting is enabled", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentText: "second line",
        metaKey: true,
        isMultiline: true,
        requireCmdEnterForLongPrompts: true,
      }),
    ).toBe("submit");
  });

  it("still submits single-line prompts with plain Enter when the setting is enabled", () => {
    expect(
      getComposerEnterAction({
        ...baseContext,
        parentText: "single line",
        isMultiline: false,
        requireCmdEnterForLongPrompts: true,
      }),
    ).toBe("submit");
  });
});
