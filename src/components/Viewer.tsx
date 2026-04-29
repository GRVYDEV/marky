import * as React from "react";
import { renderMarkdown } from "@/lib/markdown";
import { highlightCode } from "@/lib/highlight";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { attachCopyButtons } from "@/components/CodeCopyOverlay";
import { handleCopyAsMarkdown } from "@/lib/copyAsMarkdown";
import { useTheme } from "@/lib/theme";
import { usePreferences } from "@/lib/preferences";
import { useHighlights } from "@/lib/highlightsStore";
import {
  applyAllHighlights,
  scrollHighlightIntoView,
  highlightIdAt,
  highlightRect,
  setEditActive,
} from "@/lib/highlightsApply";
import {
  findEnclosingBlock,
  findSectionHeading,
  isInCodeBlock,
  newHighlightId,
  occurrenceIndexAt,
  formatItem,
  HIGHLIGHT_COLOURS,
  type Highlight,
  type HighlightColour,
} from "@/lib/highlights";
import {
  HighlightPopover,
  type HighlightPopoverState,
} from "@/components/HighlightPopover";
import {
  HighlightEditPopover,
  type HighlightEditPopoverState,
} from "@/components/HighlightEditPopover";
import { useNotify, copyWithFeedback } from "@/lib/notifications";

interface Props {
  source: string;
  filePath?: string;
  articleRef?: React.RefObject<HTMLElement | null>;
  onRendered?: () => void;
}

const scrollMemory = new Map<string, number>();

export function Viewer({ source, filePath, articleRef, onRendered }: Props) {
  const internalRef = React.useRef<HTMLElement>(null);
  const ref = (articleRef ?? internalRef) as React.RefObject<HTMLElement | null>;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const { copyAsMarkdown } = usePreferences();
  const {
    byFile,
    activeColour,
    setActiveColour,
    addHighlight,
    updateHighlight,
    removeHighlight,
  } = useHighlights();
  const { notify } = useNotify();
  const [html, setHtml] = React.useState("");
  const [popover, setPopover] = React.useState<HighlightPopoverState | null>(null);
  const [editPopover, setEditPopover] = React.useState<HighlightEditPopoverState | null>(null);
  const pendingSelection = React.useRef<{
    block: HTMLElement;
    sourceStartLine: number;
    sourceEndLine: number;
    passage: string;
    occurrence: number;
    section: string;
  } | null>(null);
  // Tabs without a real file (e.g. the Welcome screen) still get highlights;
  // we key them under a synthetic path so they persist across sessions.
  const storageKey = filePath ?? ":welcome";
  const fileHighlights = byFile[storageKey] ?? [];

  // Keep onRendered fresh without making it a dep — otherwise every parent
  // re-render produces a new fn ref, retriggers the highlight effect, and the
  // resulting outerHTML swap visibly flickers code blocks back to plain text.
  const onRenderedRef = React.useRef(onRendered);
  React.useEffect(() => {
    onRenderedRef.current = onRendered;
  }, [onRendered]);

  React.useEffect(() => {
    setHtml(renderMarkdown(source));
  }, [source]);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;

    (async () => {
      const codeBlocks = root.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
      for (const code of Array.from(codeBlocks)) {
        const cls = code.className;
        const match = cls.match(/language-([\w+-]+)/);
        const lang = match?.[1];
        const text = code.textContent || "";
        try {
          const highlighted = await highlightCode(text, lang, resolved);
          if (cancelled) return;
          const pre = code.parentElement;
          if (!pre || !pre.isConnected) continue;
          const tpl = document.createElement("template");
          tpl.innerHTML = highlighted.trim();
          const replacement = tpl.content.firstElementChild;
          if (replacement) {
            // Preserve source map attribute through Shiki replacement.
            const sourceMap = pre.getAttribute("data-source-map");
            if (sourceMap) replacement.setAttribute("data-source-map", sourceMap);
            pre.replaceWith(replacement);
          }
        } catch {
          // leave plain on failure
        }
      }
      if (cancelled) return;
      attachCopyButtons(root as HTMLElement);
      await renderMermaidBlocks(root as HTMLElement, resolved);
      if (cancelled) return;
      // Apply highlights after Shiki + Mermaid finish so code-block
      // replacements don't wipe the wrappers we just added.
      applyAllHighlights(root as HTMLElement, fileHighlights);
      if (!cancelled) onRenderedRef.current?.();
    })();

    return () => {
      cancelled = true;
    };
    // intentionally omit `ref` and `onRendered`: ref is stable, onRendered is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, resolved]);

  // Re-apply highlights when the highlight list changes for the current file
  // (e.g. user added/removed a highlight). Save+restore the scroller's
  // scrollTop around the DOM mutations: removing the wrapper span used as the
  // browser's scroll anchor causes Chrome/Safari to jump (often to the top)
  // when scroll-anchoring fails to find a fallback.
  React.useEffect(() => {
    const root = ref.current;
    const scroller = scrollerRef.current;
    if (!root) return;
    const savedScroll = scroller?.scrollTop ?? 0;
    applyAllHighlights(root as HTMLElement, fileHighlights);
    if (scroller && scroller.scrollTop !== savedScroll) {
      scroller.scrollTop = savedScroll;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileHighlights]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !filePath) return;
    const saved = scrollMemory.get(filePath) ?? 0;
    el.scrollTop = saved;
    const onScroll = () => scrollMemory.set(filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [filePath, html]);

  // Intercept copy events to write original markdown source to clipboard.
  React.useEffect(() => {
    const root = ref.current;
    if (!root || !copyAsMarkdown) return;

    const onCopy = (e: ClipboardEvent) => {
      handleCopyAsMarkdown(e, root as HTMLElement, source);
    };

    root.addEventListener("copy", onCopy);
    return () => root.removeEventListener("copy", onCopy);
  }, [source, copyAsMarkdown]);

  // Detect text selections inside the article and surface the highlight popover.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
      // If the user dragged a new selection, it takes priority over any
      // currently-open edit popover.
      setEditPopover(null);
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
      // Skip if the selection touches a code block — v1 doesn't highlight code.
      if (
        isInCodeBlock(range.startContainer, root as HTMLElement) ||
        isInCodeBlock(range.endContainer, root as HTMLElement)
      ) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
      const passage = sel.toString().trim();
      if (!passage) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
      // Find the nearest source-mapped block for both ends; if they differ we
      // pick the one containing the start anchor — multi-block selections are
      // accepted but anchor to the start block. Same-block is the common case.
      const startBlock = findEnclosingBlock(range.startContainer, root as HTMLElement);
      if (!startBlock) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
      const blockText = startBlock.element.textContent ?? "";
      const startOffsetWithinBlock = (() => {
        // Re-use a temp range to compute the offset from block start.
        const probe = document.createRange();
        probe.selectNodeContents(startBlock.element);
        probe.setEnd(range.startContainer, range.startOffset);
        return probe.toString().length;
      })();
      const occurrence = occurrenceIndexAt(blockText, passage, startOffsetWithinBlock);
      const section = findSectionHeading(startBlock.element, root as HTMLElement);

      pendingSelection.current = {
        block: startBlock.element,
        sourceStartLine: startBlock.start,
        sourceEndLine: startBlock.end,
        passage,
        occurrence,
        section,
      };

      const rect = range.getBoundingClientRect();
      setPopover({
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      });
    };

    root.addEventListener("mouseup", onMouseUp);
    return () => root.removeEventListener("mouseup", onMouseUp);
  }, [html]);

  // Click on an existing highlight → open the edit popover for it. Skipped
  // when a non-collapsed selection is present (mouseup handled that path).
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const id = highlightIdAt(e.target as Node, root as HTMLElement);
      if (!id) return;
      const items = byFile[storageKey] ?? [];
      const highlight = items.find((h) => h.id === id);
      if (!highlight) return;
      const rect = highlightRect(root as HTMLElement, id);
      if (!rect) return;
      e.stopPropagation();
      setPopover(null);
      setEditPopover({
        x: rect.left + rect.width / 2,
        y: rect.bottom,
        highlight,
      });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [byFile, storageKey, html]);

  // Keep the edit popover's data in sync if the underlying highlight changes
  // (e.g. recolour, note edit) and follow it to its new position after the
  // re-application pass.
  React.useEffect(() => {
    if (!editPopover) return;
    const items = byFile[storageKey] ?? [];
    const fresh = items.find((h) => h.id === editPopover.highlight.id);
    if (!fresh) {
      // Highlight was deleted by some other path.
      setEditPopover(null);
      return;
    }
    if (fresh !== editPopover.highlight) {
      setEditPopover({ ...editPopover, highlight: fresh });
    }
  }, [byFile, storageKey, editPopover]);

  // Visually mark the highlight currently being edited.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    setEditActive(root as HTMLElement, editPopover?.highlight.id ?? null);
  }, [editPopover?.highlight.id, html]);

  // Delete / Backspace deletes the highlight at the current selection or
  // edit-popover target. Ignored when focus is in a form field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      const root = ref.current as HTMLElement | null;
      if (!root) return;

      // Prefer the edit popover's target if open.
      let id: string | null = editPopover?.highlight.id ?? null;
      if (!id) {
        const sel = window.getSelection();
        const node = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startContainer : null;
        if (node && root.contains(node)) {
          id = highlightIdAt(node, root);
        }
      }
      if (!id) return;
      const items = byFile[storageKey] ?? [];
      const highlight = items.find((h) => h.id === id);
      if (!highlight) return;
      e.preventDefault();
      removeHighlight(storageKey, id);
      setEditPopover(null);
      notify("Highlight deleted", {
        duration: 5000,
        action: { label: "Undo", onClick: () => addHighlight(highlight) },
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editPopover, byFile, storageKey, removeHighlight, addHighlight, notify]);

  // Cycle the active colour with ] / [ at any time (no popover required).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.key !== "]" && e.key !== "[") return;
      const idx = HIGHLIGHT_COLOURS.indexOf(activeColour);
      const next =
        e.key === "]"
          ? HIGHLIGHT_COLOURS[(idx + 1) % HIGHLIGHT_COLOURS.length]
          : HIGHLIGHT_COLOURS[(idx - 1 + HIGHLIGHT_COLOURS.length) % HIGHLIGHT_COLOURS.length];
      e.preventDefault();
      setActiveColour(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeColour, setActiveColour]);

  // Apply / Copy handlers for the popover.
  const onApply = React.useCallback(
    (colour: HighlightColour, note?: string) => {
      const pending = pendingSelection.current;
      if (!pending) return;
      const h: Highlight = {
        id: newHighlightId(),
        filePath: storageKey,
        colour,
        sourceStartLine: pending.sourceStartLine,
        sourceEndLine: pending.sourceEndLine,
        passage: pending.passage,
        occurrence: pending.occurrence,
        section: pending.section,
        createdAt: new Date().toISOString(),
        note,
      };
      addHighlight(h);
      setPopover(null);
      pendingSelection.current = null;
      window.getSelection()?.removeAllRanges();
    },
    [addHighlight, storageKey],
  );

  const onCopyForAgent = React.useCallback(async () => {
    const pending = pendingSelection.current;
    if (!pending) return;
    const itemText = formatItem({
      id: "preview",
      filePath: filePath ?? "(welcome)",
      colour: activeColour,
      sourceStartLine: pending.sourceStartLine,
      sourceEndLine: pending.sourceEndLine,
      passage: pending.passage,
      occurrence: pending.occurrence,
      section: pending.section,
      createdAt: new Date().toISOString(),
    });
    await copyWithFeedback(itemText, notify);
    // Keep the popover open briefly so the inline "Copied" flash on the
    // Copy button is visible. User dismisses via Esc or outside-click.
  }, [filePath, activeColour, notify]);

  const onDismissPopover = React.useCallback(() => {
    setPopover(null);
    pendingSelection.current = null;
  }, []);

  // Edit-popover handlers.
  const onRecolour = React.useCallback(
    (id: string, colour: HighlightColour) => {
      updateHighlight(storageKey, id, { colour });
    },
    [storageKey, updateHighlight],
  );

  const onUpdateNote = React.useCallback(
    (id: string, note: string | undefined) => {
      updateHighlight(storageKey, id, { note });
    },
    [storageKey, updateHighlight],
  );

  const onCopyExisting = React.useCallback(
    async (h: Highlight) => {
      const text = formatItem({ ...h, filePath: filePath ?? h.filePath });
      await copyWithFeedback(text, notify);
    },
    [filePath, notify],
  );

  const onDeleteExisting = React.useCallback(
    (id: string) => {
      const items = byFile[storageKey] ?? [];
      const highlight = items.find((h) => h.id === id);
      if (!highlight) return;
      removeHighlight(storageKey, id);
      setEditPopover(null);
      notify("Highlight deleted", {
        duration: 5000,
        action: { label: "Undo", onClick: () => addHighlight(highlight) },
      });
    },
    [byFile, storageKey, removeHighlight, addHighlight, notify],
  );

  const onDismissEdit = React.useCallback(() => setEditPopover(null), []);

  // Custom event "marky:scroll-to-highlight" dispatched by the panel jumps to
  // the highlight with the given id. This avoids threading a ref handle up.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onJump = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") {
        scrollHighlightIntoView(root as HTMLElement, id);
      }
    };
    root.addEventListener("marky:scroll-to-highlight", onJump as EventListener);
    return () => root.removeEventListener("marky:scroll-to-highlight", onJump as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize the inner-html object so its reference is stable across renders.
  // If we passed a fresh { __html: html } object every render, React would
  // re-apply innerHTML on every re-render (e.g. when the parent Pane bumps
  // contentNonce after highlighting finishes), wiping the shiki spans we just
  // injected and restoring the raw markdown-it pre.
  const dangerousHtml = React.useMemo(() => ({ __html: html }), [html]);

  return (
    <div ref={scrollerRef} className="h-full w-full overflow-auto">
      <article ref={ref} className="markdown-body" dangerouslySetInnerHTML={dangerousHtml} />
      <HighlightPopover
        state={popover}
        activeColour={activeColour}
        onApply={onApply}
        onCopyForAgent={onCopyForAgent}
        onDismiss={onDismissPopover}
      />
      <HighlightEditPopover
        state={editPopover}
        onRecolour={onRecolour}
        onUpdateNote={onUpdateNote}
        onCopy={onCopyExisting}
        onDelete={onDeleteExisting}
        onDismiss={onDismissEdit}
      />
    </div>
  );
}
