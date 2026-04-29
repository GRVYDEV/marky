import * as React from "react";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/highlights";
import { cn } from "@/lib/utils";
import { useFlash } from "@/lib/notifications";
import { Check } from "lucide-react";

export interface HighlightPopoverState {
  /** Viewport position of the bottom-centre of the selection. */
  x: number;
  y: number;
}

interface Props {
  state: HighlightPopoverState | null;
  activeColour: HighlightColour;
  /**
   * Apply a highlight in the given colour. If `note` is provided the
   * highlight is created with the annotation in one step.
   */
  onApply: (colour: HighlightColour, note?: string) => void;
  onCopyForAgent: () => void;
  onDismiss: () => void;
}

/**
 * Floating popover anchored to the user's selection. Two modes:
 *   - Default: shows colour swatches, an Annotate button, and a Copy shortcut.
 *   - Annotate: swaps the row for an inline note input. Enter applies the
 *     highlight (in the active colour) with the note attached; Esc cancels.
 */
export function HighlightPopover({
  state,
  activeColour,
  onApply,
  onCopyForAgent,
  onDismiss,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [annotating, setAnnotating] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [copyFlashing, flashCopy] = useFlash();

  // Reset annotate state whenever a new selection produces a new popover.
  React.useEffect(() => {
    if (!state) {
      setAnnotating(false);
      setNote("");
    }
  }, [state]);

  React.useEffect(() => {
    if (annotating) inputRef.current?.focus();
  }, [annotating]);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (annotating) {
          setAnnotating(false);
          setNote("");
        } else {
          onDismiss();
        }
      } else if (!annotating && e.key >= "1" && e.key <= "5") {
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
  }, [state, annotating, onApply, onDismiss]);

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
      {!annotating ? (
        <>
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
            onClick={() => setAnnotating(true)}
            className="rounded-sm px-2 py-1 text-xs hover:bg-accent"
            title="Highlight in active colour and attach a note"
          >
            Annotate
          </button>
          <button
            type="button"
            onClick={() => {
              flashCopy();
              onCopyForAgent();
            }}
            className={cn(
              "flex items-center gap-1 rounded-sm px-2 py-1 text-xs hover:bg-accent",
              copyFlashing && "text-emerald-600 dark:text-emerald-400",
            )}
            title="Copy this passage as an agent-ready block"
          >
            {copyFlashing ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              "Copy"
            )}
          </button>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="marky-highlight-swatch h-4 w-4 shrink-0 rounded-sm border border-border/60"
            data-highlight-colour={activeColour}
            title={`Will apply ${activeColour}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApply(activeColour, note.trim() || undefined);
              }
            }}
            placeholder="Note for this highlight…"
            className="h-6 w-56 rounded-sm border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => onApply(activeColour, note.trim() || undefined)}
            className="rounded-sm px-2 py-1 text-xs hover:bg-accent"
            title="Save annotation (Enter)"
          >
            Save
          </button>
        </>
      )}
    </div>
  );
}
