import type { BundledLanguage, BundledTheme, ThemedToken } from "shiki";

export const codeRenderingConfig = {
  fallbackLanguage: "text" as BundledLanguage,
  themes: {
    dark: "github-dark" as BundledTheme,
    light: "github-light" as BundledTheme,
  },
};

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
export const isShikiItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;

// oxlint-disable-next-line eslint(no-bitwise)
export const isShikiBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;

export const isShikiUnderline = (fontStyle: number | undefined) =>
  // oxlint-disable-next-line eslint(no-bitwise)
  fontStyle && fontStyle & 4;

export const getTokensCacheKey = (code: string, language: BundledLanguage) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${code.length}:${start}:${end}`;
};

const extensionLanguageMap: Record<string, BundledLanguage> = {
  cjs: "javascript",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

export function getCodeLanguageForPath(path: string): BundledLanguage {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return extension
    ? (extensionLanguageMap[extension] ?? codeRenderingConfig.fallbackLanguage)
    : codeRenderingConfig.fallbackLanguage;
}

export interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}
