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
} from "@/lib/highlightsApply";
import {
  findEnclosingBlock,
  findSectionHeading,
  isInCodeBlock,
  newHighlightId,
  occurrenceIndexAt,
  formatItem,
  type Highlight,
  type HighlightColour,
} from "@/lib/highlights";
import {
  HighlightPopover,
  type HighlightPopoverState,
} from "@/components/HighlightPopover";

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
  const { byFile, activeColour, addHighlight } = useHighlights();
  const [html, setHtml] = React.useState("");
  const [popover, setPopover] = React.useState<HighlightPopoverState | null>(null);
  const pendingSelection = React.useRef<{
    block: HTMLElement;
    sourceStartLine: number;
    sourceEndLine: number;
    passage: string;
    occurrence: number;
    section: string;
  } | null>(null);
  const fileHighlights = filePath ? byFile[filePath] ?? [] : [];

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
  // (e.g. user added/removed a highlight). Code-block replacement isn't
  // happening on this path, so this is a cheap pass.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    applyAllHighlights(root as HTMLElement, fileHighlights);
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
    if (!root || !filePath) return;

    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPopover(null);
        pendingSelection.current = null;
        return;
      }
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
  }, [filePath, html]);

  // Apply / Copy handlers for the popover.
  const onApply = React.useCallback(
    (colour: HighlightColour) => {
      const pending = pendingSelection.current;
      if (!pending || !filePath) return;
      const h: Highlight = {
        id: newHighlightId(),
        filePath,
        colour,
        sourceStartLine: pending.sourceStartLine,
        sourceEndLine: pending.sourceEndLine,
        passage: pending.passage,
        occurrence: pending.occurrence,
        section: pending.section,
        createdAt: new Date().toISOString(),
      };
      addHighlight(h);
      setPopover(null);
      pendingSelection.current = null;
      window.getSelection()?.removeAllRanges();
    },
    [addHighlight, filePath],
  );

  const onCopyForAgent = React.useCallback(async () => {
    const pending = pendingSelection.current;
    if (!pending || !filePath) return;
    const itemText = formatItem({
      id: "preview",
      filePath,
      colour: activeColour,
      sourceStartLine: pending.sourceStartLine,
      sourceEndLine: pending.sourceEndLine,
      passage: pending.passage,
      occurrence: pending.occurrence,
      section: pending.section,
      createdAt: new Date().toISOString(),
    });
    try {
      await navigator.clipboard.writeText(itemText);
    } catch {
      // ignore
    }
    setPopover(null);
    pendingSelection.current = null;
    window.getSelection()?.removeAllRanges();
  }, [filePath, activeColour]);

  const onDismissPopover = React.useCallback(() => {
    setPopover(null);
    pendingSelection.current = null;
  }, []);

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
    </div>
  );
}
