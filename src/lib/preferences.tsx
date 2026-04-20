import * as React from "react";

export interface Preferences {
  copyAsMarkdown: boolean;
}

const STORAGE_KEY = "marky:preferences";

const DEFAULTS: Preferences = {
  copyAsMarkdown: true,
};

interface Ctx extends Preferences {
  setCopyAsMarkdown: (v: boolean) => void;
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

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(load);

  const setCopyAsMarkdown = React.useCallback((v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, copyAsMarkdown: v };
      persist(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ ...prefs, setCopyAsMarkdown }),
    [prefs, setCopyAsMarkdown],
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
