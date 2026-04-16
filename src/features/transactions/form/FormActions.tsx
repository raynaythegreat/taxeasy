import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

interface FormActionsProps {
  canSave: boolean;
  submitting: boolean;
  onClose: () => void;
  onSaveAndNew?: () => void;
}

export function FormActions({ canSave, submitting, onClose, onSaveAndNew }: FormActionsProps) {
  const { t } = useI18n();

  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
      >
        Cancel
      </button>
      {onSaveAndNew && (
        <button
          type="button"
          onClick={onSaveAndNew}
          disabled={!canSave}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded",
            canSave
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          {submitting ? "Saving…" : t("Save & New")}
        </button>
      )}
      <button
        type="submit"
        disabled={!canSave}
        className={cn(
          "px-4 py-1.5 text-sm font-medium rounded",
          canSave
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        )}
      >
        {submitting ? "Saving…" : t("Save Transaction")}
      </button>
    </div>
  );
}
