/**
 * Apply highlights as wrapping <span>s inside the rendered article DOM.
 *
 * Works by locating the source-mapped block that contains a highlight, then
 * finding the Nth occurrence of the passage within that block's textContent
 * and wrapping the corresponding text-node ranges with marky-highlight spans.
 *
 * Idempotent: a second call with the same highlights is a no-op (clearAll
 * removes prior wrappers first).
 */

import { findNthOccurrence, type Highlight } from "@/lib/highlights";

export const HIGHLIGHT_CLASS = "marky-highlight";
const ID_ATTR = "data-highlight-id";
const COLOUR_ATTR = "data-highlight-colour";

/** Remove all previously-applied highlight spans inside the container. */
export function clearAllHighlights(container: HTMLElement): void {
  const spans = container.querySelectorAll<HTMLSpanElement>(`span.${HIGHLIGHT_CLASS}`);
  for (const span of Array.from(spans)) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  }
}

/** True if the element (or any ancestor below `container`) is a <pre>. */
function inPre(node: Node, container: HTMLElement): boolean {
  let cursor: Node | null = node;
  while (cursor && cursor !== container) {
    if (cursor instanceof HTMLElement && cursor.tagName === "PRE") return true;
    cursor = cursor.parentNode;
  }
  return false;
}

/**
 * Find the source-mapped block whose [start, end) line range matches the
 * highlight. We accept exact match first, then any block whose range fully
 * contains the highlight's range — handles cases where markdown-it nests an
 * inline block inside another mapped wrapper.
 */
function findBlockForHighlight(
  container: HTMLElement,
  h: Highlight,
): HTMLElement | null {
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-map]"),
  );
  let exact: HTMLElement | null = null;
  let containing: HTMLElement | null = null;
  for (const block of blocks) {
    if (inPre(block, container)) continue;
    const raw = block.getAttribute("data-source-map");
    if (!raw) continue;
    const [s, e] = raw.split(",").map(Number);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (s === h.sourceStartLine && e === h.sourceEndLine) {
      exact = block;
      break;
    }
    if (s <= h.sourceStartLine && e >= h.sourceEndLine && !containing) {
      containing = block;
    }
  }
  return exact ?? containing;
}

/**
 * Walk text nodes in `block` (excluding any inside <pre>), and gather the
 * text-node ranges that cover characters [start, end) of the block's
 * textContent. Returns one range per text node touched.
 */
function textNodeRanges(
  block: HTMLElement,
  start: number,
  end: number,
): Array<{ node: Text; from: number; to: number }> {
  const out: Array<{ node: Text; from: number; to: number }> = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text nodes inside <pre> (we don't highlight code).
      let cursor: Node | null = node.parentNode;
      while (cursor && cursor !== block) {
        if (cursor instanceof HTMLElement && cursor.tagName === "PRE") {
          return NodeFilter.FILTER_REJECT;
        }
        cursor = cursor.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let offset = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const text = current as Text;
    const len = text.length;
    const nodeStart = offset;
    const nodeEnd = offset + len;
    offset = nodeEnd;
    if (nodeEnd <= start) continue;
    if (nodeStart >= end) break;
    const from = Math.max(0, start - nodeStart);
    const to = Math.min(len, end - nodeStart);
    if (from < to) out.push({ node: text, from, to });
  }
  return out;
}

/**
 * Wrap the [from, to) substring of `text` in a span, splitting the text node
 * as needed. Returns the inserted span.
 */
function wrapTextNodeRange(
  text: Text,
  from: number,
  to: number,
  className: string,
  attrs: Record<string, string>,
): HTMLSpanElement {
  let target = text;
  if (from > 0) target = target.splitText(from);
  if (to - from < target.length) target.splitText(to - from);
  const span = document.createElement("span");
  span.className = className;
  for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
  target.parentNode?.insertBefore(span, target);
  span.appendChild(target);
  return span;
}

/**
 * Apply a single highlight to the container. Returns true if applied, false
 * if the passage couldn't be located (orphaned).
 */
export function applyHighlight(container: HTMLElement, h: Highlight): boolean {
  const block = findBlockForHighlight(container, h);
  if (!block) return false;
  const blockText = block.textContent ?? "";
  if (!blockText) return false;

  const offset = findNthOccurrence(blockText, h.passage, h.occurrence);
  if (offset < 0) return false;
  const start = offset;
  const end = offset + h.passage.length;

  const ranges = textNodeRanges(block, start, end);
  if (ranges.length === 0) return false;

  // Wrap from last to first so earlier offsets aren't invalidated by splits.
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { node, from, to } = ranges[i];
    wrapTextNodeRange(node, from, to, HIGHLIGHT_CLASS, {
      [ID_ATTR]: h.id,
      [COLOUR_ATTR]: h.colour,
    });
  }
  return true;
}

/**
 * Apply all highlights for a file. Skips orphans silently — caller can pass
 * an `onOrphan` callback if it wants to surface them.
 */
export function applyAllHighlights(
  container: HTMLElement,
  highlights: Highlight[],
  onOrphan?: (h: Highlight) => void,
): void {
  clearAllHighlights(container);
  for (const h of highlights) {
    const ok = applyHighlight(container, h);
    if (!ok && onOrphan) onOrphan(h);
  }
}

/** Scroll the highlight identified by `id` into view, centred. */
export function scrollHighlightIntoView(container: HTMLElement, id: string): void {
  const span = container.querySelector<HTMLSpanElement>(
    `span.${HIGHLIGHT_CLASS}[${ID_ATTR}="${CSS.escape(id)}"]`,
  );
  if (span) span.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * If `node` (or any ancestor below `container`) is a highlight wrapper span,
 * return its id. Used to map click / keydown targets back to a highlight.
 */
export function highlightIdAt(node: Node, container: HTMLElement): string | null {
  let cursor: Node | null = node;
  while (cursor && cursor !== container) {
    if (
      cursor instanceof HTMLElement &&
      cursor.classList.contains(HIGHLIGHT_CLASS)
    ) {
      return cursor.getAttribute(ID_ATTR);
    }
    cursor = cursor.parentNode;
  }
  return null;
}

/**
 * Bounding rect of the highlight identified by `id`. Returns null if the
 * highlight isn't currently rendered (orphaned).
 */
export function highlightRect(container: HTMLElement, id: string): DOMRect | null {
  const span = container.querySelector<HTMLSpanElement>(
    `span.${HIGHLIGHT_CLASS}[${ID_ATTR}="${CSS.escape(id)}"]`,
  );
  return span ? span.getBoundingClientRect() : null;
}

/**
 * Toggle the visual "edit-active" outline on a highlight by id. Pass null
 * to clear all outlines.
 */
export function setEditActive(container: HTMLElement, id: string | null): void {
  const previous = container.querySelectorAll<HTMLSpanElement>(
    `span.${HIGHLIGHT_CLASS}[data-edit-active="true"]`,
  );
  for (const span of Array.from(previous)) span.removeAttribute("data-edit-active");
  if (id) {
    const target = container.querySelector<HTMLSpanElement>(
      `span.${HIGHLIGHT_CLASS}[${ID_ATTR}="${CSS.escape(id)}"]`,
    );
    if (target) target.setAttribute("data-edit-active", "true");
  }
}
