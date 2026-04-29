import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  HIGHLIGHT_COLOURS,
  formatList,
  formatItem,
  type Highlight,
  type HighlightColour,
} from "@/lib/highlights";
import { Copy, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  filePath: string | undefined;
  highlights: Highlight[];
  activeColour: HighlightColour;
  onSetActive: (c: HighlightColour) => void;
  onClose: () => void;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
}

async function copyToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Best-effort; older Tauri webviews may need a fallback. The HTML5
    // execCommand path is deprecated but is the only synchronous fallback.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

/**
 * Right-side review panel. Lists the current file's highlights grouped by
 * colour, with per-list and per-item copy actions. Clicking an item scrolls
 * the source highlight into view.
 */
export function HighlightsPanel({
  filePath,
  highlights,
  activeColour,
  onSetActive,
  onClose,
  onJump,
  onRemove,
}: Props) {
  const grouped = React.useMemo(() => {
    const out = new Map<HighlightColour, Highlight[]>();
    for (const c of HIGHLIGHT_COLOURS) out.set(c, []);
    for (const h of highlights) out.get(h.colour)?.push(h);
    return out;
  }, [highlights]);

  return (
    <aside
      aria-label="Highlights"
      className="flex h-full w-72 shrink-0 flex-col border-l bg-card/30"
    >
      <div className="flex h-9 items-center justify-between border-b px-2">
        <div className="text-xs font-medium text-foreground">Highlights</div>
        <div className="flex items-center gap-1">
          {HIGHLIGHT_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Set active colour to ${c}`}
              onClick={() => onSetActive(c)}
              className={cn(
                "marky-highlight-swatch h-4 w-4 rounded-sm border border-border/60 transition",
                c === activeColour && "ring-2 ring-foreground/50",
              )}
              data-highlight-colour={c}
              title={c}
            />
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            aria-label="Close highlights panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs">
        {!filePath ? (
          <div className="px-2 py-4 text-muted-foreground">No file open.</div>
        ) : highlights.length === 0 ? (
          <div className="px-2 py-4 text-muted-foreground">
            Select text in the document to start highlighting. Press 1–5 to
            apply a colour, or click a swatch above to switch the active colour.
          </div>
        ) : (
          HIGHLIGHT_COLOURS.map((colour) => {
            const items = grouped.get(colour) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={colour} className="mb-3">
                <header className="mb-1 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="marky-highlight-swatch h-3 w-3 rounded-sm border border-border/60"
                      data-highlight-colour={colour}
                    />
                    <span className="text-foreground">
                      {colour} ({items.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(formatList(filePath, colour, items))}
                    className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Copy this list as an agent-ready block"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </header>
                <ul className="space-y-1">
                  {items.map((h) => (
                    <li key={h.id} className="group rounded-sm border bg-card/50 p-1.5">
                      <button
                        type="button"
                        onClick={() => onJump(h.id)}
                        className="block w-full text-left text-foreground"
                      >
                        <div className="line-clamp-3 italic">"{h.passage}"</div>
                        {h.section && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {h.section}
                          </div>
                        )}
                      </button>
                      <div className="mt-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(formatItem(h))}
                          className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Copy item"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(h.id)}
                          className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete highlight"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
