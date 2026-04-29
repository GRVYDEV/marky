import { describe, it, expect, beforeEach } from "vitest";
import {
  HIGHLIGHT_COLOURS,
  emptyFile,
  newHighlightId,
  findEnclosingBlock,
  isInCodeBlock,
  findSectionHeading,
  occurrenceIndexAt,
  findNthOccurrence,
  formatItem,
  formatFile,
  formatList,
  type Highlight,
} from "./highlights";

function makeBlock(html: string): HTMLElement {
  const container = document.createElement("article");
  container.innerHTML = html;
  return container;
}

describe("HIGHLIGHT_COLOURS", () => {
  it("contains a stable ordered set of five colours", () => {
    expect(HIGHLIGHT_COLOURS).toEqual(["yellow", "orange", "pink", "blue", "purple"]);
  });
});

describe("emptyFile", () => {
  it("produces a versioned empty file", () => {
    expect(emptyFile()).toEqual({ version: 1, files: {} });
  });
});

describe("newHighlightId", () => {
  it("returns unique strings", () => {
    const a = newHighlightId();
    const b = newHighlightId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("findEnclosingBlock", () => {
  it("walks up to the nearest data-source-map ancestor", () => {
    const root = makeBlock(`<p data-source-map="3,5">hello <em>world</em></p>`);
    const em = root.querySelector("em")!;
    const block = findEnclosingBlock(em.firstChild!, root);
    expect(block).not.toBeNull();
    expect(block!.start).toBe(3);
    expect(block!.end).toBe(5);
    expect(block!.element.tagName).toBe("P");
  });

  it("returns null when no ancestor has the attribute", () => {
    const root = makeBlock(`<p>plain</p>`);
    const p = root.querySelector("p")!;
    expect(findEnclosingBlock(p.firstChild!, root)).toBeNull();
  });
});

describe("isInCodeBlock", () => {
  it("detects descendants of <pre>", () => {
    const root = makeBlock(`<pre data-source-map="0,2"><code>x</code></pre>`);
    const code = root.querySelector("code")!;
    expect(isInCodeBlock(code.firstChild!, root)).toBe(true);
  });

  it("returns false for normal paragraphs", () => {
    const root = makeBlock(`<p>plain</p>`);
    const p = root.querySelector("p")!;
    expect(isInCodeBlock(p.firstChild!, root)).toBe(false);
  });
});

describe("findSectionHeading", () => {
  it("finds the closest preceding heading at the same depth", () => {
    const root = makeBlock(`
      <h2>Installation</h2>
      <p data-source-map="3,4">Run npm install.</p>
      <h2>Usage</h2>
      <p data-source-map="6,7">Call run.</p>
    `);
    const blocks = root.querySelectorAll<HTMLElement>("p");
    expect(findSectionHeading(blocks[0], root)).toBe("Installation");
    expect(findSectionHeading(blocks[1], root)).toBe("Usage");
  });

  it("returns empty string when no heading precedes", () => {
    const root = makeBlock(`<p data-source-map="0,1">no heading</p>`);
    const p = root.querySelector("p")!;
    expect(findSectionHeading(p, root)).toBe("");
  });

  it("strips the permalink anchor symbol", () => {
    const root = makeBlock(`
      <h2><a href="#x" aria-hidden="true">#</a>Performance</h2>
      <p data-source-map="3,4">benchmarks</p>
    `);
    const p = root.querySelector("p")!;
    expect(findSectionHeading(p, root)).toMatch(/Performance/);
  });
});

describe("occurrenceIndexAt", () => {
  it("returns 0 for the first occurrence", () => {
    expect(occurrenceIndexAt("foo bar foo", "foo", 0)).toBe(0);
  });

  it("counts earlier occurrences", () => {
    const text = "foo bar foo bar foo";
    expect(occurrenceIndexAt(text, "foo", 0)).toBe(0);
    expect(occurrenceIndexAt(text, "foo", 8)).toBe(1);
    expect(occurrenceIndexAt(text, "foo", 16)).toBe(2);
  });

  it("returns 0 for empty passage", () => {
    expect(occurrenceIndexAt("anything", "", 5)).toBe(0);
  });
});

describe("findNthOccurrence", () => {
  it("returns the offset of the Nth match", () => {
    const text = "foo bar foo bar foo";
    expect(findNthOccurrence(text, "foo", 0)).toBe(0);
    expect(findNthOccurrence(text, "foo", 1)).toBe(8);
    expect(findNthOccurrence(text, "foo", 2)).toBe(16);
  });

  it("returns -1 when not enough matches", () => {
    expect(findNthOccurrence("foo bar", "foo", 1)).toBe(-1);
  });

  it("returns -1 for empty passage", () => {
    expect(findNthOccurrence("foo bar", "", 0)).toBe(-1);
  });
});

describe("formatItem", () => {
  let h: Highlight;
  beforeEach(() => {
    h = {
      id: "h1",
      filePath: "/abs/README.md",
      colour: "yellow",
      sourceStartLine: 10,
      sourceEndLine: 11,
      passage: "Run `npm install` then go.",
      occurrence: 0,
      section: "Installation",
      createdAt: "2026-04-29T15:30:00.000Z",
    };
  });

  it("includes path, blockquoted passage, section, timestamp", () => {
    const out = formatItem(h);
    expect(out).toContain("Source: /abs/README.md");
    expect(out).toContain("> Run `npm install` then go.");
    expect(out).toContain("Section: Installation");
    expect(out).toContain("Timestamp: 2026-04-29T15:30:00Z");
  });

  it("blockquotes every line of multi-line passages", () => {
    h.passage = "first line\nsecond line";
    const out = formatItem(h);
    expect(out).toContain("> first line\n> second line");
  });

  it("omits Section: when no heading is captured", () => {
    h.section = "";
    expect(formatItem(h)).not.toContain("Section:");
  });

  it("emits a Note: line only when the highlight has an annotation", () => {
    expect(formatItem(h)).not.toContain("Note:");
    h.note = "needs a primary source";
    expect(formatItem(h)).toContain("Note: needs a primary source");
  });

  it("trims whitespace and skips empty notes", () => {
    h.note = "   ";
    expect(formatItem(h)).not.toContain("Note:");
    h.note = "  real ";
    expect(formatItem(h)).toContain("Note: real");
  });
});

describe("formatList", () => {
  it("emits only the requested colour", () => {
    const items: Highlight[] = [
      {
        id: "1",
        filePath: "/a.md",
        colour: "yellow",
        sourceStartLine: 0,
        sourceEndLine: 1,
        passage: "alpha",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
      {
        id: "2",
        filePath: "/a.md",
        colour: "pink",
        sourceStartLine: 2,
        sourceEndLine: 3,
        passage: "beta",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ];
    const out = formatList("/a.md", "pink", items);
    expect(out).toContain("## List: pink");
    expect(out).toContain("> beta");
    expect(out).not.toContain("> alpha");
    expect(out).not.toContain("yellow");
  });

  it("returns empty string for an empty colour", () => {
    expect(formatList("/a.md", "blue", [])).toBe("");
  });
});

describe("formatFile", () => {
  it("groups by colour and preserves the canonical colour order", () => {
    const items: Highlight[] = [
      {
        id: "1",
        filePath: "/a.md",
        colour: "purple",
        sourceStartLine: 0,
        sourceEndLine: 1,
        passage: "p",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
      {
        id: "2",
        filePath: "/a.md",
        colour: "yellow",
        sourceStartLine: 2,
        sourceEndLine: 3,
        passage: "y",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
      {
        id: "3",
        filePath: "/a.md",
        colour: "blue",
        sourceStartLine: 4,
        sourceEndLine: 5,
        passage: "b",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ];
    const out = formatFile("/a.md", items);
    const yellowAt = out.indexOf("## List: yellow");
    const blueAt = out.indexOf("## List: blue");
    const purpleAt = out.indexOf("## List: purple");
    expect(yellowAt).toBeGreaterThan(-1);
    expect(yellowAt).toBeLessThan(blueAt);
    expect(blueAt).toBeLessThan(purpleAt);
  });

  it("omits empty colour buckets", () => {
    const items: Highlight[] = [
      {
        id: "1",
        filePath: "/a.md",
        colour: "yellow",
        sourceStartLine: 0,
        sourceEndLine: 1,
        passage: "y",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ];
    const out = formatFile("/a.md", items);
    expect(out).toContain("## List: yellow");
    expect(out).not.toContain("## List: pink");
    expect(out).not.toContain("## List: blue");
  });

  it("returns empty string for no highlights", () => {
    expect(formatFile("/a.md", [])).toBe("");
  });

  it("emits per-item Note: lines when highlights are annotated", () => {
    const items: Highlight[] = [
      {
        id: "1",
        filePath: "/a.md",
        colour: "yellow",
        sourceStartLine: 0,
        sourceEndLine: 1,
        passage: "alpha",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
        note: "rewrite this sentence",
      },
      {
        id: "2",
        filePath: "/a.md",
        colour: "yellow",
        sourceStartLine: 2,
        sourceEndLine: 3,
        passage: "beta",
        occurrence: 0,
        section: "",
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ];
    const out = formatFile("/a.md", items);
    expect(out).toContain("Note: rewrite this sentence");
    // Item with no note doesn't emit a Note: line.
    expect(out.match(/Note:/g)).toHaveLength(1);
  });
});
