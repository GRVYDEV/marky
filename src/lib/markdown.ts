import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";

export interface ParsedHeading {
  level: number;
  text: string;
  slug: string;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.use(anchor, {
  permalink: anchor.permalink.linkInsideHeader({
    symbol: "#",
    placement: "before",
    ariaHidden: true,
  }),
  slugify: (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-"),
});
md.use(footnote);
md.use(taskLists, { enabled: true, label: false });

// Mark mermaid blocks for client-side rendering rather than syntax highlighting.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  if (info === "mermaid") {
    const code = token.content;
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="mermaid-pending"><code>${escaped}</code></pre>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// Add target=_blank to external http(s) links.
const defaultLink = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) =>
  self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noreferrer noopener");
  }
  return defaultLink(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string): string {
  const html = md.render(source);
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "class", "id", "aria-hidden"],
    ADD_TAGS: ["section"],
  });
}

export function extractHeadings(source: string): ParsedHeading[] {
  const tokens = md.parse(source, {});
  const out: ParsedHeading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    const level = parseInt(t.tag.slice(1), 10);
    const inline = tokens[i + 1];
    const text = inline?.content || "";
    const slug = (t.attrGet("id") as string) || text.toLowerCase().replace(/\s+/g, "-");
    out.push({ level, text, slug });
  }
  return out;
}

export const _md = md; // exported for tests
