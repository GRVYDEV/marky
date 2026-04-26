declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  interface Options {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: Options) => void;
  export default plugin;
}

declare module "markdown-it-front-matter" {
  import type MarkdownIt from "markdown-it";
  type FrontMatterCallback = (frontMatter: string) => void;
  const plugin: (md: MarkdownIt, callback?: FrontMatterCallback) => void;
  export default plugin;
}
