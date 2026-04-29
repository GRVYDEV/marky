import * as React from "react";
import { HIGHLIGHT_COLOURS, type Highlight, type HighlightColour } from "@/lib/highlights";
import { Trash2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlash } from "@/lib/notifications";

export interface HighlightEditPopoverState {
  /** Viewport position of the bottom-centre of the highlight. */
  x: number;
  y: number;
  highlight: Highlight;
}

interface Props {
  state: HighlightEditPopoverState | null;
  onRecolour: (id: string, colour: HighlightColour) => void;
  onUpdateNote: (id: string, note: string | undefined) => void;
  onCopy: (h: Highlight) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}

/**
 * Popover anchored to an EXISTING highlight. Lets the user recolour, edit
 * the note inline, copy the agent-ready block, or delete. Dismisses on
 * outside click or Escape. Number keys 1–5 recolour. Delete/Backspace
 * removes the highlight.
 */
export function HighlightEditPopover({
  state,
  onRecolour,
  onUpdateNote,
  onCopy,
  onDelete,
  onDismiss,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [editingNote, setEditingNote] = React.useState(false);
  const [draftNote, setDraftNote] = React.useState("");
  const [copyFlashing, flashCopy] = useFlash();
  const [deleteFlashing, setDeleteFlashing] = React.useState(false);
  const deleteTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current);
      }
    };
  }, []);

  // When a new highlight is targeted, reset edit state and seed the draft.
  React.useEffect(() => {
    if (!state) {
      setEditingNote(false);
      setDraftNote("");
      return;
    }
    setEditingNote(false);
    setDraftNote(state.highlight.note ?? "");
  }, [state?.highlight.id]);

  React.useEffect(() => {
    if (editingNote) inputRef.current?.focus();
  }, [editingNote]);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (editingNote) {
        // Editor swallows its own keys; only the surrounding popover handles
        // dismiss / commit on global Escape and Cmd+Enter.
        if (e.key === "Escape") {
          e.preventDefault();
          setEditingNote(false);
          setDraftNote(state.highlight.note ?? "");
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onUpdateNote(state.highlight.id, draftNote.trim() || undefined);
          setEditingNote(false);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDelete(state.highlight.id);
      } else if (e.key >= "1" && e.key <= "5") {
        const idx = parseInt(e.key, 10) - 1;
        const colour = HIGHLIGHT_COLOURS[idx];
        if (colour) {
          e.preventDefault();
          onRecolour(state.highlight.id, colour);
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
  }, [state, editingNote, draftNote, onRecolour, onUpdateNote, onDelete, onDismiss]);

  if (!state) return null;
  const { highlight: h } = state;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Edit highlight"
      className="fixed z-50 flex max-w-sm flex-col gap-2 rounded-md border bg-popover p-2 shadow-md"
      style={{
        left: state.x,
        top: state.y,
        transform: "translate(-50%, 8px)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        {HIGHLIGHT_COLOURS.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label={`Recolour to ${c} (${i + 1})`}
            title={`${c} (${i + 1})`}
            onClick={() => onRecolour(h.id, c)}
            className={cn(
              "marky-highlight-swatch h-5 w-5 rounded-sm border border-border/60 transition",
              c === h.colour && "ring-2 ring-foreground/50",
            )}
            data-highlight-colour={c}
          />
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => {
            flashCopy();
            onCopy(h);
          }}
          className={cn(
            "flex items-center gap-1 rounded-sm px-2 py-1 text-xs hover:bg-accent",
            copyFlashing && "text-emerald-600 dark:text-emerald-400",
          )}
          title="Copy agent-ready block"
        >
          {copyFlashing ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
        <button
          type="button"
          disabled={deleteFlashing}
          onClick={() => {
            // Show inline "Deleted" briefly, then call onDelete (which
            // dismisses the popover and triggers the toast).
            setDeleteFlashing(true);
            if (deleteTimerRef.current !== null) {
              window.clearTimeout(deleteTimerRef.current);
            }
            deleteTimerRef.current = window.setTimeout(() => {
              deleteTimerRef.current = null;
              onDelete(h.id);
            }, 450);
          }}
          className={cn(
            "flex items-center gap-1 rounded-sm px-2 py-1 text-xs",
            deleteFlashing
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive hover:bg-destructive/10",
          )}
          title="Delete (Del / Backspace)"
        >
          {deleteFlashing ? (
            <>
              <Check className="h-3 w-3" /> Deleted
            </>
          ) : (
            <>
              <Trash2 className="h-3 w-3" /> Delete
            </>
          )}
        </button>
      </div>
      {editingNote ? (
        <div className="flex flex-col gap-1">
          <textarea
            ref={inputRef}
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Note for this highlight…"
            rows={3}
            className="rounded-sm border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex justify-end gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => {
                setEditingNote(false);
                setDraftNote(h.note ?? "");
              }}
              className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateNote(h.id, draftNote.trim() || undefined);
                setEditingNote(false);
              }}
              className="rounded-sm px-1.5 py-0.5 text-foreground hover:bg-accent"
            >
              Save (⌘↵)
            </button>
          </div>
        </div>
      ) : h.note ? (
        <button
          type="button"
          onClick={() => {
            setDraftNote(h.note ?? "");
            setEditingNote(true);
          }}
          className="rounded-sm bg-muted/50 px-2 py-1 text-left text-xs hover:bg-muted"
          title="Edit note"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Note</div>
          <div className="whitespace-pre-wrap text-foreground">{h.note}</div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftNote("");
            setEditingNote(true);
          }}
          className="rounded-sm border border-dashed px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          + Add note
        </button>
      )}
    </div>
  );
}
