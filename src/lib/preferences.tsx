import * as React from "react";
import { tauri } from "@/lib/tauri";

export interface Preferences {
  copyAsMarkdown: boolean;
  zoom: number;
  sidebarLeftWidth: number;
  sidebarRightWidth: number;
  sidebarGroupByRepo: boolean;
}

const STORAGE_KEY = "marky:preferences";

const DEFAULTS: Preferences = {
  copyAsMarkdown: true,
  zoom: 1.0,
  sidebarLeftWidth: 256,
  sidebarRightWidth: 224,
  sidebarGroupByRepo: true,
};

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

export const SIDEBAR_LEFT_MIN = 180;
export const SIDEBAR_LEFT_MAX = 400;
export const SIDEBAR_LEFT_DEFAULT = 256;
export const SIDEBAR_RIGHT_MIN = 160;
export const SIDEBAR_RIGHT_MAX = 360;
export const SIDEBAR_RIGHT_DEFAULT = 224;

interface Ctx extends Preferences {
  setCopyAsMarkdown: (v: boolean) => void;
  setSidebarGroupByRepo: (v: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setSidebarWidth: (side: "left" | "right", width: number) => void;
  resetSidebarWidth: (side: "left" | "right") => void;
}

const PreferencesContext = React.createContext<Ctx | null>(null);

function load(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

let backendTimer: ReturnType<typeof setTimeout> | null = null;
function persistToBackend(prefs: Preferences) {
  if (backendTimer) clearTimeout(backendTimer);
  backendTimer = setTimeout(() => {
    tauri.savePreferences({
      zoom: prefs.zoom,
      sidebar_left_width: prefs.sidebarLeftWidth,
      sidebar_right_width: prefs.sidebarRightWidth,
      copy_as_markdown: prefs.copyAsMarkdown,
      sidebar_group_by_repo: prefs.sidebarGroupByRepo,
    }).catch(() => {});
  }, 300);
}

function clampZoom(z: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(load);

  // On mount, reconcile with Rust backend (authoritative source).
  React.useEffect(() => {
    tauri.loadPreferences().then((backend) => {
      setPrefs((prev) => {
        const next = { ...prev };
        if (backend.zoom != null) next.zoom = backend.zoom;
        if (backend.sidebar_left_width != null) next.sidebarLeftWidth = backend.sidebar_left_width;
        if (backend.sidebar_right_width != null) next.sidebarRightWidth = backend.sidebar_right_width;
        if (backend.copy_as_markdown != null) next.copyAsMarkdown = backend.copy_as_markdown;
        if (backend.sidebar_group_by_repo != null) next.sidebarGroupByRepo = backend.sidebar_group_by_repo;
        persist(next);
        return next;
      });
    }).catch(() => {});
  }, []);

  // Apply zoom to root font-size so all rem-based text scales app-wide.
  React.useEffect(() => {
    document.documentElement.style.fontSize = `${16 * prefs.zoom}px`;
    return () => { document.documentElement.style.fontSize = ""; };
  }, [prefs.zoom]);

  const update = React.useCallback((fn: (prev: Preferences) => Preferences) => {
    setPrefs((prev) => {
      const next = fn(prev);
      persist(next);
      persistToBackend(next);
      return next;
    });
  }, []);

  const setCopyAsMarkdown = React.useCallback(
    (v: boolean) => update((p) => ({ ...p, copyAsMarkdown: v })),
    [update],
  );

  const setSidebarGroupByRepo = React.useCallback(
    (v: boolean) => update((p) => ({ ...p, sidebarGroupByRepo: v })),
    [update],
  );

  const zoomIn = React.useCallback(
    () => update((p) => ({ ...p, zoom: clampZoom(p.zoom + ZOOM_STEP) })),
    [update],
  );

  const zoomOut = React.useCallback(
    () => update((p) => ({ ...p, zoom: clampZoom(p.zoom - ZOOM_STEP) })),
    [update],
  );

  const zoomReset = React.useCallback(
    () => update((p) => ({ ...p, zoom: 1.0 })),
    [update],
  );

  const setSidebarWidth = React.useCallback(
    (side: "left" | "right", width: number) => {
      const min = side === "left" ? SIDEBAR_LEFT_MIN : SIDEBAR_RIGHT_MIN;
      const max = side === "left" ? SIDEBAR_LEFT_MAX : SIDEBAR_RIGHT_MAX;
      const clamped = Math.round(Math.min(max, Math.max(min, width)));
      const key = side === "left" ? "sidebarLeftWidth" : "sidebarRightWidth";
      update((p) => ({ ...p, [key]: clamped }));
    },
    [update],
  );

  const resetSidebarWidth = React.useCallback(
    (side: "left" | "right") => {
      const key = side === "left" ? "sidebarLeftWidth" : "sidebarRightWidth";
      const def = side === "left" ? SIDEBAR_LEFT_DEFAULT : SIDEBAR_RIGHT_DEFAULT;
      update((p) => ({ ...p, [key]: def }));
    },
    [update],
  );

  const value = React.useMemo(
    () => ({
      ...prefs,
      setCopyAsMarkdown,
      setSidebarGroupByRepo,
      zoomIn,
      zoomOut,
      zoomReset,
      setSidebarWidth,
      resetSidebarWidth,
    }),
    [prefs, setCopyAsMarkdown, setSidebarGroupByRepo, zoomIn, zoomOut, zoomReset, setSidebarWidth, resetSidebarWidth],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): Ctx {
  const ctx = React.useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
