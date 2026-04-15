import * as React from "react";
import { renderMarkdown } from "@/lib/markdown";
import { highlightCode } from "@/lib/highlight";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { attachCopyButtons } from "@/components/CodeCopyOverlay";
import { useTheme } from "@/lib/theme";

interface Props {
  source: string;
  filePath?: string;
}

const scrollMemory = new Map<string, number>();

export function Viewer({ source, filePath }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
    setHtml(renderMarkdown(source));
  }, [source]);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;

    (async () => {
      // Highlight all <pre><code class="language-X">...
      const codeBlocks = root.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
      for (const code of Array.from(codeBlocks)) {
        const cls = code.className;
        const match = cls.match(/language-([\w+-]+)/);
        const lang = match?.[1];
        const text = code.textContent || "";
        try {
          const highlighted = await highlightCode(text, lang);
          if (cancelled) return;
          const pre = code.parentElement;
          if (pre) {
            pre.outerHTML = highlighted; // shiki returns a complete <pre class="shiki">...
          }
        } catch {
          // leave plain on failure
        }
      }
      if (cancelled) return;
      attachCopyButtons(root);
      await renderMermaidBlocks(root, resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [html, resolved]);

  // Scroll memory per file path.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !filePath) return;
    const saved = scrollMemory.get(filePath) ?? 0;
    el.scrollTop = saved;
    const onScroll = () => scrollMemory.set(filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [filePath, html]);

  return (
    <div ref={scrollerRef} className="h-full overflow-auto">
      <article ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
