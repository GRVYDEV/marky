import * as React from "react";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/highlights";
import { cn } from "@/lib/utils";

export interface HighlightPopoverState {
  /** Viewport position of the bottom-centre of the selection. */
  x: number;
  y: number;
}

interface Props {
  state: HighlightPopoverState | null;
  activeColour: HighlightColour;
  onApply: (colour: HighlightColour) => void;
  onCopyForAgent: () => void;
  onDismiss: () => void;
}

/**
 * Floating popover anchored to the user's selection. Shows the five colour
 * swatches plus a "Copy for agent" shortcut. Click a swatch → apply highlight.
 * Dismisses on outside click or Escape.
 */
export function HighlightPopover({
  state,
  activeColour,
  onApply,
  onCopyForAgent,
  onDismiss,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      } else if (e.key >= "1" && e.key <= "5") {
        const idx = parseInt(e.key, 10) - 1;
        const colour = HIGHLIGHT_COLOURS[idx];
        if (colour) {
          e.preventDefault();
          onApply(colour);
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [state, onApply, onDismiss]);

  if (!state) return null;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight"
      className="fixed z-50 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      style={{
        left: state.x,
        top: state.y,
        transform: "translate(-50%, 8px)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {HIGHLIGHT_COLOURS.map((c, i) => (
        <button
          key={c}
          type="button"
          aria-label={`Highlight ${c} (${i + 1})`}
          title={`${c} (${i + 1})`}
          onClick={() => onApply(c)}
          className={cn(
            "marky-highlight-swatch h-5 w-5 rounded-sm border border-border/60 transition",
            c === activeColour && "ring-2 ring-foreground/50",
          )}
          data-highlight-colour={c}
        />
      ))}
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onCopyForAgent}
        className="rounded-sm px-2 py-1 text-xs hover:bg-accent"
        title="Copy this passage as an agent-ready block"
      >
        Copy
      </button>
    </div>
  );
}
