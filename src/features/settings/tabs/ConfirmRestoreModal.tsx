import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

interface ConfirmRestoreModalProps {
  restoring: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmRestoreModal({ restoring, onConfirm, onCancel }: ConfirmRestoreModalProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">{t("Confirm Restore")}</h3>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {t(
            "This will overwrite all your current data with the backup. This action cannot be undone.",
          )}
        </p>
        <div className="flex items-center gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={restoring}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {restoring && <Spinner />}
            {t("Restore")}
          </button>
        </div>
      </div>
    </div>
  );
}
