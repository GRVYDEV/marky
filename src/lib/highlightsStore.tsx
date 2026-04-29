import * as React from "react";
import { tauri, type HighlightPayload } from "@/lib/tauri";
import {
  DEFAULT_COLOUR,
  type Highlight,
  type HighlightColour,
} from "@/lib/highlights";

interface Ctx {
  /** Active colour applied when no swatch is explicitly chosen. */
  activeColour: HighlightColour;
  setActiveColour: (c: HighlightColour) => void;
  /** Per-file highlights as a flat list, keyed externally by filePath. */
  byFile: Record<string, Highlight[]>;
  /** Whether the right-side review panel is open. */
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  addHighlight: (h: Highlight) => void;
  removeHighlight: (filePath: string, id: string) => void;
  clearFile: (filePath: string) => void;
}

const HighlightsContext = React.createContext<Ctx | null>(null);

const ACTIVE_KEY = "marky:highlights:activeColour";
const PANEL_KEY = "marky:highlights:panelOpen";

function loadActive(): HighlightColour {
  if (typeof window === "undefined") return DEFAULT_COLOUR;
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (raw === "yellow" || raw === "orange" || raw === "pink" || raw === "blue" || raw === "purple") {
    return raw;
  }
  return DEFAULT_COLOUR;
}

function loadPanel(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PANEL_KEY) === "true";
}

function fromPayload(p: HighlightPayload): Highlight {
  return {
    id: p.id,
    filePath: p.filePath,
    colour: p.colour as HighlightColour,
    sourceStartLine: p.sourceStartLine,
    sourceEndLine: p.sourceEndLine,
    passage: p.passage,
    occurrence: p.occurrence,
    section: p.section,
    createdAt: p.createdAt,
  };
}

function toPayload(h: Highlight): HighlightPayload {
  return { ...h };
}

export function HighlightsProvider({ children }: { children: React.ReactNode }) {
  const [activeColour, setActiveColour] = React.useState<HighlightColour>(loadActive);
  const [panelOpen, setPanelOpen] = React.useState<boolean>(loadPanel);
  const [byFile, setByFile] = React.useState<Record<string, Highlight[]>>({});

  // Load all highlights on mount.
  React.useEffect(() => {
    tauri
      .loadHighlights()
      .then((file) => {
        const next: Record<string, Highlight[]> = {};
        for (const [path, items] of Object.entries(file.files ?? {})) {
          next[path] = items.map(fromPayload);
        }
        setByFile(next);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeColour);
  }, [activeColour]);

  React.useEffect(() => {
    localStorage.setItem(PANEL_KEY, panelOpen ? "true" : "false");
  }, [panelOpen]);

  const persistFile = React.useCallback((filePath: string, items: Highlight[]) => {
    tauri.saveHighlightsForFile(filePath, items.map(toPayload)).catch(() => {});
  }, []);

  const addHighlight = React.useCallback(
    (h: Highlight) => {
      setByFile((prev) => {
        const items = [...(prev[h.filePath] ?? []), h];
        persistFile(h.filePath, items);
        return { ...prev, [h.filePath]: items };
      });
    },
    [persistFile],
  );

  const removeHighlight = React.useCallback(
    (filePath: string, id: string) => {
      setByFile((prev) => {
        const items = (prev[filePath] ?? []).filter((h) => h.id !== id);
        persistFile(filePath, items);
        const next = { ...prev };
        if (items.length === 0) delete next[filePath];
        else next[filePath] = items;
        return next;
      });
    },
    [persistFile],
  );

  const clearFile = React.useCallback(
    (filePath: string) => {
      setByFile((prev) => {
        if (!prev[filePath]) return prev;
        persistFile(filePath, []);
        const next = { ...prev };
        delete next[filePath];
        return next;
      });
    },
    [persistFile],
  );

  const value = React.useMemo<Ctx>(
    () => ({
      activeColour,
      setActiveColour,
      byFile,
      panelOpen,
      setPanelOpen,
      addHighlight,
      removeHighlight,
      clearFile,
    }),
    [activeColour, byFile, panelOpen, addHighlight, removeHighlight, clearFile],
  );

  return <HighlightsContext.Provider value={value}>{children}</HighlightsContext.Provider>;
}

export function useHighlights(): Ctx {
  const ctx = React.useContext(HighlightsContext);
  if (!ctx) throw new Error("useHighlights must be used within HighlightsProvider");
  return ctx;
}
