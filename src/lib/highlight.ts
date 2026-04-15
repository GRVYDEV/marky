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

export async function highlightCode(
  code: string,
  lang: string | undefined,
  theme: "light" | "dark" = "dark"
): Promise<string> {
  const hl = await getHighlighter();
  const loaded = hl.getLoadedLanguages();
  let resolvedLang = lang && loaded.includes(lang as BundledLanguage) ? lang : "";
  if (lang && !resolvedLang) {
    try {
      await hl.loadLanguage(lang as BundledLanguage);
      resolvedLang = lang;
    } catch {
      resolvedLang = "";
    }
  }
  return hl.codeToHtml(code, {
    lang: resolvedLang || "text",
    theme: theme === "dark" ? "github-dark" : "github-light",
  });
}
