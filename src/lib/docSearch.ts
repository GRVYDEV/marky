/**
 * In-document text search. Walks the rendered markdown DOM, wraps matches
 * in <mark class="doc-search-match">, and lets us cycle through them.
 */

const MARK_CLASS = "doc-search-match";
const ACTIVE_CLASS = "doc-search-active";

export interface SearchHandle {
  matches: HTMLElement[];
  clear: () => void;
}

export function highlightMatches(root: HTMLElement, query: string): SearchHandle {
  if (!query) return { matches: [], clear: () => {} };

  const lowered = query.toLowerCase();

  // happy-dom's TreeWalker has spotty NodeFilter support; do a manual walk.
  const targets: Text[] = [];
  const collect = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const parent = text.parentElement;
      if (!parent) return;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return;
      if (parent.classList?.contains(MARK_CLASS)) return;
      if (text.nodeValue && text.nodeValue.length > 0) targets.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    for (const child of Array.from(el.childNodes)) collect(child);
  };
  collect(root);

  const created: HTMLElement[] = [];

  for (const text of targets) {
    const value = text.nodeValue ?? "";
    const lower = value.toLowerCase();
    let cursor = 0;
    let idx = lower.indexOf(lowered, cursor);
    if (idx === -1) continue;

    const frag = document.createDocumentFragment();
    while (idx !== -1) {
      if (idx > cursor) frag.appendChild(document.createTextNode(value.slice(cursor, idx)));
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = value.slice(idx, idx + query.length);
      frag.appendChild(mark);
      created.push(mark);
      cursor = idx + query.length;
      idx = lower.indexOf(lowered, cursor);
    }
    if (cursor < value.length) frag.appendChild(document.createTextNode(value.slice(cursor)));
    text.parentNode?.replaceChild(frag, text);
  }

  return {
    matches: created,
    clear: () => {
      for (const el of created) {
        const parent = el.parentNode;
        if (!parent) continue;
        parent.replaceChild(document.createTextNode(el.textContent ?? ""), el);
        parent.normalize?.();
      }
    },
  };
}

export function setActiveMatch(matches: HTMLElement[], index: number): HTMLElement | null {
  if (matches.length === 0) return null;
  for (const m of matches) m.classList.remove(ACTIVE_CLASS);
  const wrapped = ((index % matches.length) + matches.length) % matches.length;
  const target = matches[wrapped];
  target.classList.add(ACTIVE_CLASS);
  return target;
}
