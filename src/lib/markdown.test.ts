import { describe, expect, it } from "vitest";
import { renderMarkdown, extractHeadings } from "./markdown";

describe("renderMarkdown", () => {
  it("renders a heading with an anchor", () => {
    const html = renderMarkdown("# Hello World");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello World");
    expect(html).toMatch(/id="hello-world"/);
  });

  it("renders GFM tables", () => {
    const md = `| a | b |\n|---|---|\n| 1 | 2 |\n`;
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task lists with checkboxes", () => {
    const md = `- [x] done\n- [ ] todo\n`;
    const html = renderMarkdown(md);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders fenced code blocks with language class", () => {
    const md = "```ts\nconst x = 1;\n```\n";
    const html = renderMarkdown(md);
    expect(html).toMatch(/<pre><code class="language-ts">/);
  });

  it("flags mermaid blocks as pending for client-side rendering", () => {
    const md = "```mermaid\ngraph TD;A-->B;\n```\n";
    const html = renderMarkdown(md);
    expect(html).toContain("mermaid-pending");
    expect(html).toContain("graph TD");
  });

  it("adds target=_blank to external links", () => {
    const html = renderMarkdown("[ext](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("does not add target=_blank to relative links", () => {
    const html = renderMarkdown("[rel](./a.md)");
    expect(html).not.toContain('target="_blank"');
  });

  it("sanitizes script tags", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\nokay");
    expect(html).not.toContain("<script");
    expect(html).toContain("okay");
  });

  it("renders strikethrough", () => {
    const html = renderMarkdown("~~gone~~");
    expect(html).toContain("<s>gone</s>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdown("> a quote");
    expect(html).toContain("<blockquote>");
  });
});

describe("extractHeadings", () => {
  it("returns level/text/slug for each heading", () => {
    const md = `# One\n\n## Two\n\n### Three`;
    const hs = extractHeadings(md);
    expect(hs).toHaveLength(3);
    expect(hs[0]).toMatchObject({ level: 1, text: "One", slug: "one" });
    expect(hs[1]).toMatchObject({ level: 2, text: "Two", slug: "two" });
    expect(hs[2]).toMatchObject({ level: 3, text: "Three", slug: "three" });
  });

  it("handles documents without headings", () => {
    expect(extractHeadings("just text\n\nmore text")).toEqual([]);
  });
});
