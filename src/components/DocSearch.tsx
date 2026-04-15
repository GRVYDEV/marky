import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { highlightMatches, setActiveMatch } from "@/lib/docSearch";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  contentNonce: number;
}

export function DocSearch({ open, onClose, containerRef, contentNonce }: Props) {
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(0);
  const handleRef = useRef<{ matches: HTMLElement[]; clear: () => void } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleRef.current?.clear();
    handleRef.current = null;
    setCount(0);
    setActive(0);
    if (!open || !query || !containerRef.current) return;
    const h = highlightMatches(containerRef.current, query);
    handleRef.current = h;
    setCount(h.matches.length);
    if (h.matches.length > 0) {
      const el = setActiveMatch(h.matches, 0);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return () => {
      h.clear();
    };
  }, [query, open, contentNonce, containerRef]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const goTo = (delta: number) => {
    const matches = handleRef.current?.matches ?? [];
    if (matches.length === 0) return;
    const next = active + delta;
    setActive(next);
    const el = setActiveMatch(matches, next);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  if (!open) return null;

  return (
    <div className="absolute right-4 top-2 z-40 flex items-center gap-1 rounded-md border bg-popover px-2 py-1 shadow-md">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goTo(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
        placeholder="Find in document"
        className="h-7 w-56 bg-transparent px-1 text-sm outline-none"
      />
      <span className="min-w-[3.5rem] text-center text-xs text-muted-foreground tabular-nums">
        {count === 0 ? "0/0" : `${(((active % count) + count) % count) + 1}/${count}`}
      </span>
      <Button onClick={() => goTo(-1)} variant="ghost" size="icon" className="h-6 w-6" aria-label="Previous match">
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button onClick={() => goTo(1)} variant="ghost" size="icon" className="h-6 w-6" aria-label="Next match">
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button onClick={onClose} variant="ghost" size="icon" className="h-6 w-6" aria-label="Close find">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
