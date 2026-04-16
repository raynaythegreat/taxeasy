import { CheckCircle2, RefreshCw, Download, ExternalLink } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import type { UpdateCheck } from "../../../lib/updater-api";

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

interface AboutTabProps {
  appVersion: string;
  updateCheck: UpdateCheck | null;
  checkingUpdate: boolean;
  onCheckUpdate: () => void;
}

export function AboutTab({ appVersion, updateCheck, checkingUpdate, onCheckUpdate }: AboutTabProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Taxeasy</h2>
          <p className="text-sm text-gray-500 mt-1">{t("Local-first bookkeeping")}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">{t("Version")}</span>
            <span className="text-sm font-medium text-gray-900">{appVersion}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">{t("Tech Stack")}</span>
            <span className="text-sm font-medium text-gray-900">
              Tauri, React, and SQLite
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t("Check for Updates")}</h3>

        <div className="flex items-center gap-3">
          <button
            onClick={onCheckUpdate}
            disabled={checkingUpdate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {checkingUpdate && <Spinner />}
            <RefreshCw className="w-4 h-4" />
            {checkingUpdate ? t("Checking…") : t("Check Now")}
          </button>
        </div>

        {updateCheck && (
          <div className={cn(
            "rounded-lg border p-4 space-y-2",
            updateCheck.hasUpdate
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          )}>
            {updateCheck.hasUpdate ? (
              <>
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    {t("Update available")}: v{updateCheck.latestVersion}
                  </span>
                </div>
                {updateCheck.downloadUrl && (
                  <a
                    href={updateCheck.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("Download Update")}
                  </a>
                )}
                <a
                  href={updateCheck.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t("View release notes")}
                </a>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {t("You're up to date")} (v{updateCheck.currentVersion})
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
