import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  show: (message: string, type: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Styling helpers ───────────────────────────────────────────────────────────

const TYPE_CLASSES: Record<ToastType, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-blue-600 text-white",
  warning: "bg-amber-500 text-white",
};

const TYPE_ICON: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
};

// ── Single Toast ──────────────────────────────────────────────────────────────

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium min-w-[260px] max-w-sm",
        TYPE_CLASSES[toast.type],
        prefersReducedMotion ? "opacity-100" : "animate-toast-slide-in",
      ].join(" ")}
    >
      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white/20">
        {TYPE_ICON[toast.type]}
      </span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType, duration = 4000) => {
      const id = ++nextId;
      const item: ToastItem = { id, message, type, duration };
      setToasts((prev) => [...prev, item]);

      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback(
    (message: string, duration?: number) => show(message, "success", duration),
    [show],
  );
  const error = useCallback(
    (message: string, duration?: number) => show(message, "error", duration),
    [show],
  );
  const info = useCallback(
    (message: string, duration?: number) => show(message, "info", duration),
    [show],
  );
  const warning = useCallback(
    (message: string, duration?: number) => show(message, "warning", duration),
    [show],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning }}>
      {children}
      {/* Toast stack — bottom-right */}
      <div
        aria-label="Notifications"
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: "calc(100vw - 3rem)" }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastEntry toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
