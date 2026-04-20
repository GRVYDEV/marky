import * as React from "react";
import { renderMarkdown } from "@/lib/markdown";
import { highlightCode } from "@/lib/highlight";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { attachCopyButtons } from "@/components/CodeCopyOverlay";
import { handleCopyAsMarkdown } from "@/lib/copyAsMarkdown";
import { useTheme } from "@/lib/theme";
import { usePreferences } from "@/lib/preferences";

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
  const [html, setHtml] = React.useState("");

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
      if (!cancelled) onRenderedRef.current?.();
    })();

    return () => {
      cancelled = true;
    };
    // intentionally omit `ref` and `onRendered`: ref is stable, onRendered is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, resolved]);

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

  // Memoize the inner-html object so its reference is stable across renders.
  // If we passed a fresh { __html: html } object every render, React would
  // re-apply innerHTML on every re-render (e.g. when the parent Pane bumps
  // contentNonce after highlighting finishes), wiping the shiki spans we just
  // injected and restoring the raw markdown-it pre.
  const dangerousHtml = React.useMemo(() => ({ __html: html }), [html]);

  return (
    <div ref={scrollerRef} className="h-full w-full overflow-auto">
      <article ref={ref} className="markdown-body" dangerouslySetInnerHTML={dangerousHtml} />
    </div>
  );
}
