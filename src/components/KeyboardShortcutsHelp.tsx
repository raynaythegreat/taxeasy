import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["⌘", "N"], label: "New Transaction" },
  { keys: ["⌘", "E"], label: "Edit Selected" },
  { keys: ["⌘", "I"], label: "Import" },
  { keys: ["⌘", "R"], label: "View Reports" },
  { keys: ["⌘", "B"], label: "Toggle Sidebar" },
  { keys: ["⌘", ","], label: "Settings" },
  { keys: ["?"], label: "Show Shortcuts" },
  { keys: ["Esc"], label: "Close / Cancel" },
] as const;

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-xl border shadow-2xl",
          "bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl",
          "border-gray-200 dark:border-slate-700",
          "text-gray-900 dark:text-slate-100"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 space-y-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-sm text-gray-600 dark:text-slate-400">
                {s.label}
              </span>
              <div className="flex items-center gap-0.5">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className={cn(
                      "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5",
                      "text-xs font-mono font-medium rounded",
                      "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300",
                      "border border-gray-200 dark:border-slate-600"
                    )}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
            Press <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-[10px] font-mono">?</kbd> to toggle this panel
          </p>
        </div>
      </div>
    </div>
  );
}
