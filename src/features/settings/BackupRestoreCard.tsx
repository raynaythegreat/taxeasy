import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

interface BackupRestoreCardProps {
  title: string;
  description: string;
  buttonText: string;
  buttonIcon: LucideIcon;
  onAction: () => void;
  loading: boolean;
  variant?: "primary" | "danger";
}

export function BackupRestoreCard({
  title,
  description,
  buttonText,
  buttonIcon: ButtonIcon,
  onAction,
  loading,
  variant = "primary",
}: BackupRestoreCardProps) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      {variant === "danger" && (
        <p className="text-xs text-amber-600 font-medium">
          {t("This will overwrite your current data. Make sure you have a recent backup.")}
        </p>
      )}
      <button
        type="button"
        onClick={onAction}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "danger"
            ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
            : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
        )}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            {t("Working…")}
          </>
        ) : (
          <>
            <ButtonIcon className="w-4 h-4" />
            {buttonText}
          </>
        )}
      </button>
    </div>
  );
}
