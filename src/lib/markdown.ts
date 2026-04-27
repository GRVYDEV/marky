import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import frontMatter from "markdown-it-front-matter";
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

// Strip YAML front matter so files written for static-site generators,
// Obsidian, MDX, or spec corpora don't render as a giant setext heading
// at the top of the document. Without this, a leading `---\n...key: value\n---`
// block is parsed as: thematic break + paragraph + setext H2 underline.
// We capture the front matter and discard it; future work could expose the
// captured value for metadata display.
md.use(frontMatter, () => {
  // intentionally empty — front matter is not rendered
});

// Inject data-source-map attributes on block-level tokens so the copy handler
// can map rendered DOM selections back to original source lines.
md.core.ruler.push("source_map_attrs", (state) => {
  for (const token of state.tokens) {
    if (!token.map) continue;
    const attr = `${token.map[0]},${token.map[1]}`;
    if (token.nesting === 1) {
      // Opening block tags: p, h1–h6, ul, ol, li, blockquote, table, etc.
      token.attrPush(["data-source-map", attr]);
    } else if (token.nesting === 0 && (token.type === "hr" || token.type === "code_block")) {
      token.attrPush(["data-source-map", attr]);
    }
    // fence tokens are handled in the fence renderer override below.
  }
});

// Mark mermaid blocks for client-side rendering rather than syntax highlighting.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  const sourceMapAttr = token.map ? ` data-source-map="${token.map[0]},${token.map[1]}"` : "";
  if (info === "mermaid") {
    const code = token.content;
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="mermaid-pending"${sourceMapAttr}><code>${escaped}</code></pre>`;
  }
  let html = defaultFence(tokens, idx, options, env, self);
  if (sourceMapAttr) {
    html = html.replace(/^<pre(?=[\s>])/, `<pre${sourceMapAttr}`);
  }
  return html;
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
    ADD_ATTR: ["target", "class", "id", "aria-hidden", "data-source-map"],
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
