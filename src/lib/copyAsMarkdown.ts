/**
 * Intercepts the browser copy event on the rendered markdown article
 * and replaces the clipboard content with the original markdown source
 * lines corresponding to the user's selection.
 */

function findMappedAncestor(node: Node, container: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== container) {
    if (current instanceof HTMLElement && current.hasAttribute("data-source-map")) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function parseMap(el: HTMLElement): [number, number] {
  const raw = el.getAttribute("data-source-map")!;
  const [a, b] = raw.split(",").map(Number);
  return [a, b];
}

/**
 * Given a DOM Selection within a source-mapped container, determine which
 * source lines are covered. Returns [startLine, endLine) or null.
 */
export function getSourceRange(
  selection: Selection,
  container: HTMLElement,
): [number, number] | null {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return null;
  if (!container.contains(anchor) || !container.contains(focus)) return null;

  const startEl = findMappedAncestor(anchor, container);
  const endEl = findMappedAncestor(focus, container);
  if (!startEl && !endEl) return null;

  // Collect all mapped elements in document order.
  const all = Array.from(container.querySelectorAll<HTMLElement>("[data-source-map]"));
  if (all.length === 0) return null;

  let startIdx = startEl ? all.indexOf(startEl) : 0;
  let endIdx = endEl ? all.indexOf(endEl) : all.length - 1;

  // If either element wasn't found in the list (shouldn't happen), bail.
  if (startIdx === -1) startIdx = 0;
  if (endIdx === -1) endIdx = all.length - 1;

  // User may have selected backwards.
  if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (let i = startIdx; i <= endIdx; i++) {
    const [s, e] = parseMap(all[i]);
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }

  if (minStart === Infinity || maxEnd === -Infinity) return null;
  return [minStart, maxEnd];
}

/** Extract lines [start, end) from a source string. */
export function extractLines(source: string, start: number, end: number): string {
  const lines = source.split("\n");
  return lines.slice(start, end).join("\n");
}

/**
 * Copy event handler. Intercepts the copy and writes original markdown
 * to the clipboard. Returns true if handled, false to fall through.
 */
export function handleCopyAsMarkdown(
  event: ClipboardEvent,
  container: HTMLElement,
  source: string,
): boolean {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return false;

  const range = getSourceRange(selection, container);
  if (!range) return false;

  const markdown = extractLines(source, range[0], range[1]);
  if (!markdown.trim()) return false;

  event.preventDefault();
  event.clipboardData?.setData("text/plain", markdown);
  return true;
}
