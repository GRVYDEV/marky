import * as React from "react";

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationOptions {
  /** Auto-dismiss after this many ms. Default 1500. */
  duration?: number;
  /** Optional inline action (e.g. "Undo" on a destructive notification). */
  action?: NotificationAction;
  /** Visual tone. `success` is the default; `destructive` styles use the
   *  destructive token (matters for delete-with-undo). */
  tone?: "success" | "destructive" | "info";
}

interface Notification extends NotificationOptions {
  id: number;
  message: string;
  duration: number;
  tone: "success" | "destructive" | "info";
}

interface Ctx {
  notify: (message: string, opts?: NotificationOptions) => void;
}

const NotificationsContext = React.createContext<Ctx | null>(null);

let counter = 0;

/**
 * Centralised toast / notification system. Components anywhere in the tree
 * can call `useNotify().notify("Copied to clipboard")` or
 * `notify("Highlight deleted", { duration: 5000, action: { label: "Undo", onClick: ... } })`.
 *
 * Renders a stack of toasts at the bottom-right of the viewport.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Notification[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = React.useCallback(
    (message: string, opts: NotificationOptions = {}) => {
      const id = ++counter;
      const duration = opts.duration ?? 1500;
      const next: Notification = {
        id,
        message,
        duration,
        tone: opts.tone ?? (opts.action ? "destructive" : "success"),
        action: opts.action,
      };
      setItems((prev) => [...prev, next]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = React.useMemo<Ctx>(() => ({ notify }), [notify]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {items.map((n) => (
          <Toast key={n.id} item={n} onDismiss={() => dismiss(n.id)} />
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

interface ToastProps {
  item: Notification;
  onDismiss: () => void;
}

function Toast({ item, onDismiss }: ToastProps) {
  const tone =
    item.tone === "destructive"
      ? "border-destructive/40"
      : item.tone === "info"
        ? "border-border"
        : "border-emerald-500/40";

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md ${tone}`}
    >
      <span className="text-foreground">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action!.onClick();
            onDismiss();
          }}
          className="rounded-sm bg-foreground px-2 py-1 text-background hover:opacity-90"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function useNotify(): Ctx {
  const ctx = React.useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotify must be used within NotificationsProvider");
  return ctx;
}

/**
 * Tiny inline-feedback hook. Pair with a button that toggles its label /
 * icon when `flashing` is true, e.g.:
 *
 *   const [flashing, flash] = useFlash();
 *   <button onClick={() => { doThing(); flash(); }}>
 *     {flashing ? "Copied" : "Copy"}
 *   </button>
 *
 * The button reverts to its original label after `duration` ms (default 1100).
 */
export function useFlash(duration = 1100): [boolean, () => void] {
  const [flashing, setFlashing] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const trigger = React.useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setFlashing(true);
    timerRef.current = window.setTimeout(() => {
      setFlashing(false);
      timerRef.current = null;
    }, duration);
  }, [duration]);
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);
  return [flashing, trigger];
}

/**
 * Helper that writes to the clipboard and notifies on success/failure.
 * Centralised so every Copy site has identical UX.
 */
export async function copyWithFeedback(
  text: string,
  notify: Ctx["notify"],
  successMessage = "Copied to clipboard",
): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    notify(successMessage);
    return true;
  } catch {
    // Fallback for older webviews — execCommand is deprecated but synchronous.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        notify(successMessage);
        return true;
      }
    } catch {
      // ignore
    }
    notify("Couldn't copy to clipboard", { tone: "destructive" });
    return false;
  }
}
