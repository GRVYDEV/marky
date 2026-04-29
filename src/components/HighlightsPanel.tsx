import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  HIGHLIGHT_COLOURS,
  formatList,
  formatItem,
  type Highlight,
  type HighlightColour,
} from "@/lib/highlights";
import { Copy, Trash2, X, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotify, copyWithFeedback, useFlash } from "@/lib/notifications";

// Component-local helper: a Copy button with both inline ✓ flash and a
// toast (via copyWithFeedback). Used at every Copy site in the panel so
// feedback is uniform.

interface CopyButtonProps {
  text: string;
  successMessage?: string;
  title: string;
  iconClassName?: string;
  className?: string;
  /** When true, render label "Copy" / "Copied" inline next to the icon. */
  withLabel?: boolean;
}

/**
 * Small Copy button with both inline ✓ flash and a parent-rendered toast
 * (via copyWithFeedback). Used at every Copy site in the panel so feedback
 * is uniform.
 */
function CopyButton({
  text,
  successMessage,
  title,
  iconClassName = "h-3 w-3",
  className,
  withLabel,
}: CopyButtonProps) {
  const { notify } = useNotify();
  const [flashing, flash] = useFlash();
  return (
    <button
      type="button"
      title={title}
      onClick={async () => {
        const ok = await copyWithFeedback(text, notify, successMessage);
        if (ok) flash();
      }}
      className={cn(
        "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground",
        flashing && "text-emerald-600 dark:text-emerald-400 hover:text-emerald-600",
        className,
      )}
    >
      {flashing ? <Check className={iconClassName} /> : <Copy className={iconClassName} />}
      {withLabel && <span>{flashing ? "Copied" : "Copy"}</span>}
    </button>
  );
}

interface Props {
  filePath: string | undefined;
  highlights: Highlight[];
  activeColour: HighlightColour;
  onSetActive: (c: HighlightColour) => void;
  onClose: () => void;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string | undefined) => void;
}

interface NoteEditorProps {
  initial: string;
  onCommit: (value: string | undefined) => void;
  onCancel: () => void;
}

function NoteEditor({ initial, onCommit, onCancel }: NoteEditorProps) {
  const [value, setValue] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="mt-1 flex flex-col gap-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onCommit(value.trim() || undefined);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={2}
        placeholder="Note…"
        className="rounded-sm border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Cancel (Esc)
        </button>
        <button
          type="button"
          onClick={() => onCommit(value.trim() || undefined)}
          className="rounded-sm px-1.5 py-0.5 text-[10px] text-foreground hover:bg-accent"
        >
          <Check className="mr-1 inline-block h-3 w-3" /> Save (⌘↵)
        </button>
      </div>
    </div>
  );
}

/**
 * Right-side review panel. Lists the current file's highlights grouped by
 * colour, with per-list and per-item copy and per-item annotation editing.
 * Header has a row of colour-filter pills — click one to show only that
 * colour, click again to clear the filter.
 */
export function HighlightsPanel({
  filePath,
  highlights,
  activeColour,
  onSetActive,
  onClose,
  onJump,
  onRemove,
  onUpdateNote,
}: Props) {
  const [filter, setFilter] = React.useState<HighlightColour | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const visible = React.useMemo(
    () => (filter ? highlights.filter((h) => h.colour === filter) : highlights),
    [filter, highlights],
  );

  const grouped = React.useMemo(() => {
    const out = new Map<HighlightColour, Highlight[]>();
    for (const c of HIGHLIGHT_COLOURS) out.set(c, []);
    for (const h of visible) out.get(h.colour)?.push(h);
    return out;
  }, [visible]);

  const counts = React.useMemo(() => {
    const c = new Map<HighlightColour, number>();
    for (const colour of HIGHLIGHT_COLOURS) c.set(colour, 0);
    for (const h of highlights) c.set(h.colour, (c.get(h.colour) ?? 0) + 1);
    return c;
  }, [highlights]);

  // Aggregate text for the header Copy button. Recomputes whenever the
  // visible set changes; the CopyButton handles the click + flash + toast.
  const visibleText = React.useMemo(() => {
    if (!filePath || visible.length === 0) return "";
    if (filter) return formatList(filePath, filter, visible);
    const parts = HIGHLIGHT_COLOURS
      .map((c) => formatList(filePath, c, visible))
      .filter((s) => s.length > 0);
    return parts.join("\n");
  }, [filePath, visible, filter]);
  const visibleCopyMessage = filter
    ? `Copied ${filter} list (${visible.length})`
    : `Copied ${visible.length} highlights`;

  return (
    <aside
      aria-label="Highlights"
      className="flex h-full w-80 shrink-0 flex-col border-l bg-card/30"
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
              title={`Active colour: ${c}`}
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
      {/* Filter pills + Copy-visible action. */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 text-[10px]">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={cn(
            "rounded-full border px-2 py-0.5",
            filter === null ? "bg-foreground text-background" : "hover:bg-accent",
          )}
        >
          All ({highlights.length})
        </button>
        {HIGHLIGHT_COLOURS.map((c) => {
          const n = counts.get(c) ?? 0;
          if (n === 0) return null;
          const active = filter === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(active ? null : c)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5",
                active ? "bg-foreground text-background" : "hover:bg-accent",
              )}
              title={`Filter to ${c}`}
            >
              <span
                className="marky-highlight-swatch h-2.5 w-2.5 rounded-sm"
                data-highlight-colour={c}
              />
              {n}
            </button>
          );
        })}
        {highlights.length > 0 && (
          <CopyButton
            text={visibleText}
            successMessage={visibleCopyMessage}
            title={filter ? `Copy ${filter} list` : "Copy visible lists"}
            withLabel={false}
            className="ml-auto"
          />
        )}
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs">
        {!filePath ? (
          <div className="px-2 py-4 text-muted-foreground">No file open.</div>
        ) : highlights.length === 0 ? (
          <div className="px-2 py-4 text-muted-foreground">
            Select text in the document to start highlighting. Press 1–5 to
            apply a colour, click Annotate to attach a note.
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
                  <CopyButton
                    text={formatList(filePath, colour, items)}
                    successMessage={`Copied ${colour} list (${items.length})`}
                    title="Copy this list as an agent-ready block"
                  />
                </header>
                <ul className="space-y-1">
                  {items.map((h) => {
                    const isEditing = editingId === h.id;
                    return (
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
                        {isEditing ? (
                          <NoteEditor
                            initial={h.note ?? ""}
                            onCommit={(v) => {
                              onUpdateNote(h.id, v);
                              setEditingId(null);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : h.note ? (
                          <div className="mt-1 rounded-sm bg-muted/50 px-1.5 py-1 text-foreground">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Note
                            </span>
                            <div className="whitespace-pre-wrap">{h.note}</div>
                          </div>
                        ) : null}
                        <div className="mt-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => setEditingId(h.id)}
                              className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              title={h.note ? "Edit note" : "Add note"}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <CopyButton text={formatItem(h)} title="Copy item" />
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
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
