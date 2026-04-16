import { X } from "lucide-react";
import { cn } from "../../../lib/utils";

interface FormHeaderProps {
  mode: "simple" | "advanced";
  scanning: boolean;
  onToggleMode: () => void;
  onScanReceipt: () => void;
  onClose: () => void;
}

export function FormHeader({ mode, scanning, onToggleMode, onScanReceipt, onClose }: FormHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
      <h2 className="text-base font-semibold text-gray-900">New Transaction</h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMode}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
            mode === "advanced"
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
          )}
        >
          {mode === "simple" ? "Advanced" : "Simple"}
        </button>
        <button
          type="button"
          onClick={onScanReceipt}
          disabled={scanning}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {scanning ? (
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          {scanning ? "Scanning…" : "Scan Receipt"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
