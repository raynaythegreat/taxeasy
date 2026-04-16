import type { CategorizeSuggestion } from "../../../lib/tauri";

interface AiSuggestionChipProps {
  suggestion: CategorizeSuggestion;
  onAccept: (suggestion: CategorizeSuggestion) => void;
  onDismiss: () => void;
}

export function AiSuggestionChip({ suggestion, onAccept, onDismiss }: AiSuggestionChipProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs">
      <svg
        aria-hidden="true"
        className="w-3.5 h-3.5 text-blue-500 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-blue-700 flex-1">
        AI suggests: <strong>{suggestion.account_name}</strong> — {suggestion.reason}
      </span>
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="px-1.5 py-0.5 rounded text-blue-400 hover:text-blue-600"
      >
        ✕
      </button>
    </div>
  );
}
