import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_COMPOSER_PLACEHOLDER,
  getChatComposerPlaceholder,
  getComposerEnterAction,
  parseCodeFenceLanguage,
} from "../../src/mainview/components/chatComposerUtils.ts";

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
        key: "Enter",
        shiftKey: false,
        selectionEmpty: true,
        parentNodeType: "paragraph",
        parentText: "```ts",
        isAtEndOfBlock: true,
      }),
    ).toBe("convertFence");
  });

  it("also converts a fence starter on Shift+Enter", () => {
    expect(
      getComposerEnterAction({
        key: "Enter",
        shiftKey: true,
        selectionEmpty: true,
        parentNodeType: "paragraph",
        parentText: "```ts",
        isAtEndOfBlock: true,
      }),
    ).toBe("convertFence");
  });

  it("lets Enter stay inside code blocks", () => {
    expect(
      getComposerEnterAction({
        key: "Enter",
        shiftKey: false,
        selectionEmpty: true,
        parentNodeType: "codeBlock",
        parentText: "const x = 1;",
        isAtEndOfBlock: true,
      }),
    ).toBe("pass");
  });

  it("submits normal Enter presses in regular paragraphs", () => {
    expect(
      getComposerEnterAction({
        key: "Enter",
        shiftKey: false,
        selectionEmpty: true,
        parentNodeType: "paragraph",
        parentText: "hello world",
        isAtEndOfBlock: true,
      }),
    ).toBe("submit");
  });
});
