/**
 * Highlights — types, anchoring helpers, and agent-export formatting.
 *
 * Highlights are anchored to source markdown by:
 *   - sourceStartLine / sourceEndLine : the [start, end) line range of the
 *     enclosing block (taken from the data-source-map attribute markdown-it
 *     emits on block-level tokens).
 *   - passage                          : the literal selected text (from the
 *     rendered article's textContent).
 *   - occurrence                       : 0-based index, in case the same
 *     passage appears multiple times within the same source-line range.
 *
 * On restoration we re-locate the passage within the matching block; if it
 * isn't found we mark the highlight orphaned and skip rendering. Code blocks
 * are not highlightable in v1.
 */

export const HIGHLIGHT_COLOURS = ["yellow", "orange", "pink", "blue", "purple"] as const;
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number];

export const DEFAULT_COLOUR: HighlightColour = "yellow";

export interface Highlight {
  id: string;
  filePath: string;
  colour: HighlightColour;
  sourceStartLine: number;
  sourceEndLine: number;
  passage: string;
  occurrence: number;
  section: string;
  createdAt: string;
  /**
   * Optional per-item annotation. Surfaces in the panel below the passage
   * and is included on its own `Note:` line in the agent-export format.
   */
  note?: string;
}

export interface HighlightsByPath {
  [absolutePath: string]: Highlight[];
}

export interface HighlightsFile {
  version: 1;
  files: HighlightsByPath;
}

export function emptyFile(): HighlightsFile {
  return { version: 1, files: {} };
}

/** Generate a UUID-ish id without pulling in a dep. */
export function newHighlightId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Walk up from `node` to the nearest ancestor inside `container` carrying a
 * `data-source-map` attribute. Returns the element + parsed [start, end).
 */
export function findEnclosingBlock(
  node: Node,
  container: HTMLElement,
): { element: HTMLElement; start: number; end: number } | null {
  let current: Node | null = node;
  while (current && current !== container) {
    if (current instanceof HTMLElement && current.hasAttribute("data-source-map")) {
      const raw = current.getAttribute("data-source-map")!;
      const parts = raw.split(",").map(Number);
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return { element: current, start: parts[0], end: parts[1] };
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** Common ancestor of two DOM nodes, or null if they're disconnected. */
export function commonAncestor(a: Node, b: Node): Node | null {
  const ancestors = new Set<Node>();
  let cursor: Node | null = a;
  while (cursor) {
    ancestors.add(cursor);
    cursor = cursor.parentNode;
  }
  cursor = b;
  while (cursor) {
    if (ancestors.has(cursor)) return cursor;
    cursor = cursor.parentNode;
  }
  return null;
}

/** True if the node is inside a `<pre>` (i.e. a code block). */
export function isInCodeBlock(node: Node, container: HTMLElement): boolean {
  let cursor: Node | null = node;
  while (cursor && cursor !== container) {
    if (cursor instanceof HTMLElement && cursor.tagName === "PRE") return true;
    cursor = cursor.parentNode;
  }
  return false;
}

/** Nearest preceding heading text (h1..h6). Returns "" if none found. */
export function findSectionHeading(block: HTMLElement, container: HTMLElement): string {
  let cursor: Element | null = block;
  while (cursor && cursor !== container) {
    let sibling: Element | null = cursor.previousElementSibling;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) {
        return (sibling.textContent || "").trim().replace(/^#\s*/, "");
      }
      const heading = sibling.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) return (heading.textContent || "").trim().replace(/^#\s*/, "");
      sibling = sibling.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return "";
}

/**
 * Count how many times `passage` appears inside `block.textContent` before the
 * given character offset within that text content. This gives us a stable
 * occurrence index for restoration even when the passage repeats.
 */
export function occurrenceIndexAt(blockText: string, passage: string, offset: number): number {
  if (!passage) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor < offset) {
    const found = blockText.indexOf(passage, cursor);
    if (found === -1 || found >= offset) break;
    count += 1;
    cursor = found + 1;
  }
  return count;
}

/**
 * Find the offset of the Nth (0-based) occurrence of `passage` in `text`.
 * Returns -1 if there aren't that many occurrences.
 */
export function findNthOccurrence(text: string, passage: string, n: number): number {
  if (!passage) return -1;
  let cursor = 0;
  for (let i = 0; i <= n; i++) {
    const found = text.indexOf(passage, cursor);
    if (found === -1) return -1;
    if (i === n) return found;
    cursor = found + 1;
  }
  return -1;
}

/**
 * Compute the character offset of `node` (start of node) within
 * `container.textContent`. Walks the DOM in document order.
 */
export function textOffsetOf(node: Node, container: HTMLElement): number {
  if (!container.contains(node)) return -1;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current === node) return offset;
    offset += (current as Text).length;
    if (current.contains(node)) {
      // node is inside this text node's parent; not possible since text nodes
      // are leaves, but keeps types happy.
      return offset;
    }
  }
  return -1;
}

/** Format a single ISO timestamp for the export footer. */
function fmtTime(iso: string): string {
  return iso.replace(/\.\d+Z$/, "Z");
}

/** Markdown-blockquote a passage. Keeps multi-line passages readable. */
function blockquote(passage: string): string {
  return passage
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * Render a single highlight as a self-contained agent-friendly block.
 * Source path is included so the agent can locate the file.
 */
export function formatItem(h: Highlight): string {
  const lines = [
    `Source: ${h.filePath}`,
    "",
    blockquote(h.passage),
  ];
  if (h.section) lines.push(`Section: ${h.section}`);
  lines.push(`Timestamp: ${fmtTime(h.createdAt)}`);
  if (h.note && h.note.trim()) lines.push(`Note: ${h.note.trim()}`);
  return lines.join("\n");
}

/**
 * Render all highlights for a file, grouped by colour. This is the format
 * pasted to a coding agent at the end of a review session.
 */
export function formatFile(filePath: string, highlights: Highlight[]): string {
  if (highlights.length === 0) return "";
  const grouped = new Map<HighlightColour, Highlight[]>();
  for (const colour of HIGHLIGHT_COLOURS) grouped.set(colour, []);
  for (const h of highlights) {
    grouped.get(h.colour)?.push(h);
  }

  const out: string[] = [`Source: ${filePath}`, ""];
  for (const colour of HIGHLIGHT_COLOURS) {
    const items = grouped.get(colour) ?? [];
    if (items.length === 0) continue;
    out.push(`## List: ${colour}`);
    out.push("");
    for (const h of items) {
      out.push(blockquote(h.passage));
      if (h.section) out.push(`Section: ${h.section}`);
      out.push(`Timestamp: ${fmtTime(h.createdAt)}`);
      if (h.note && h.note.trim()) out.push(`Note: ${h.note.trim()}`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}

/** Render a single colour list as its own block (subset of formatFile). */
export function formatList(
  filePath: string,
  colour: HighlightColour,
  highlights: Highlight[],
): string {
  const items = highlights.filter((h) => h.colour === colour);
  if (items.length === 0) return "";
  const out: string[] = [
    `Source: ${filePath}`,
    "",
    `## List: ${colour}`,
    "",
  ];
  for (const h of items) {
    out.push(blockquote(h.passage));
    if (h.section) out.push(`Section: ${h.section}`);
    out.push(`Timestamp: ${fmtTime(h.createdAt)}`);
    if (h.note && h.note.trim()) out.push(`Note: ${h.note.trim()}`);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}
