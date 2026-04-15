import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
} from "shiki";

const COMMON_LANGS: BundledLanguage[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "rust",
  "python",
  "go",
  "bash",
  "shell",
  "yaml",
  "toml",
  "html",
  "css",
  "sql",
  "md",
  "diff",
  "java",
  "c",
  "cpp",
  "ruby",
];

const THEMES: BundledTheme[] = ["github-light", "github-dark"];

let promise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!promise) {
    promise = createHighlighter({ themes: THEMES, langs: COMMON_LANGS });
  }
  return promise;
}

export async function highlightCode(code: string, lang: string | undefined): Promise<string> {
  const hl = await getHighlighter();
  const loaded = hl.getLoadedLanguages();
  let resolved = lang && loaded.includes(lang as BundledLanguage) ? lang : "";
  if (lang && !resolved) {
    try {
      await hl.loadLanguage(lang as BundledLanguage);
      resolved = lang;
    } catch {
      resolved = "";
    }
  }
  return hl.codeToHtml(code, {
    lang: resolved || "text",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
