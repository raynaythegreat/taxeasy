import { openPath } from "@tauri-apps/plugin-opener";
import { CheckCircle2, Download, ExternalLink, FileText, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../lib/i18n";
import { getErrorLogPath } from "../../../lib/logger";
import type { UpdateCheck, UpdateProgress } from "../../../lib/updater-api";
import {
  downloadUpdate,
  installUpdate,
  onUpdateProgress,
  pullLatestCommits,
} from "../../../lib/updater-api";
import { cn } from "../../../lib/utils";

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

export function AboutTab({
  appVersion,
  updateCheck,
  checkingUpdate,
  onCheckUpdate,
}: AboutTabProps) {
  const { t } = useI18n();
  const [exportingDiag, setExportingDiag] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);
  const [isPullingCommits, setIsPullingCommits] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);

  // Listen for update progress events
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await onUpdateProgress((progress) => {
        setUpdateProgress(progress);
        if (progress.status === "downloading") {
          setIsDownloading(true);
        } else if (progress.status === "installing") {
          setIsDownloading(false);
          setIsReadyToInstall(true);
        } else if (progress.status === "ready") {
          setIsDownloading(false);
          setIsReadyToInstall(true);
        } else if (progress.status === "error") {
          setIsDownloading(false);
        }
      });
      return unlisten;
    };

    setupListener().then((unlisten) => unlisten);
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    setIsDownloading(true);
    setUpdateProgress({ status: "downloading" });
    try {
      await downloadUpdate();
      setIsReadyToInstall(true);
      setUpdateProgress({ status: "ready", progress: 100 });
    } catch (err) {
      setUpdateProgress({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to download update",
      });
      setIsDownloading(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateProgress({ status: "installing" });
    try {
      await installUpdate();
      // App will restart - this code won't continue
    } catch (err) {
      setUpdateProgress({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to install update",
      });
    }
  }, []);

  const handlePullCommits = useCallback(async () => {
    setIsPullingCommits(true);
    setPullMessage(null);
    setUpdateProgress({ status: "pulling" });
    try {
      const message = await pullLatestCommits();
      setPullMessage(message);
      setUpdateProgress({ status: "ready", progress: 100 });
    } catch (err) {
      setPullMessage(err instanceof Error ? err.message : "Failed to pull commits");
      setUpdateProgress({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to pull commits",
      });
    } finally {
      setIsPullingCommits(false);
    }
  }, []);

  const handleExportDiagnostics = useCallback(async () => {
    setExportingDiag(true);
    try {
      const logPath = await getErrorLogPath();
      await openPath(logPath);
    } catch {
      // If errors.log doesn't exist yet, open the log directory instead
      try {
        const logPath = await getErrorLogPath();
        const sep = logPath.includes("/") ? "/" : "\\";
        const dir = logPath.substring(0, logPath.lastIndexOf(sep));
        await openPath(dir);
      } catch {
        // Last resort: swallow
      }
    } finally {
      setExportingDiag(false);
    }
  }, []);

  const progressBar =
    updateProgress && updateProgress.status === "downloading" ? (
      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${updateProgress.progress || 50}%` }}
        />
      </div>
    ) : null;

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
            <span className="text-sm font-medium text-gray-900">Tauri, React, and SQLite</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t("Diagnostics")}</h3>
        <p className="text-sm text-gray-500">
          {t("Open the error log file to review or share diagnostic information.")}
        </p>
        <button
          type="button"
          onClick={handleExportDiagnostics}
          disabled={exportingDiag}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <FileText className="w-4 h-4" />
          {exportingDiag ? t("Opening…") : t("Export diagnostics")}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t("Check for Updates")}</h3>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCheckUpdate}
            disabled={checkingUpdate || isDownloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {checkingUpdate && <Spinner />}
            <RefreshCw className="w-4 h-4" />
            {checkingUpdate ? t("Checking…") : t("Check Now")}
          </button>

          <button
            type="button"
            onClick={handlePullCommits}
            disabled={isPullingCommits || isDownloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isPullingCommits && <Spinner />}
            <Download className="w-4 h-4" />
            {isPullingCommits ? t("Pulling...") : t("Pull Latest Commits")}
          </button>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoUpdateEnabled}
              onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t("Auto-update")}
          </label>
        </div>

        {updateProgress && (
          <div className="text-sm text-gray-600">
            {updateProgress.status === "pulling" && (
              <span className="flex items-center gap-2">
                <Spinner />
                Pulling latest commits...
              </span>
            )}
            {updateProgress.status === "downloading" && (
              <span className="flex items-center gap-2">
                <Spinner />
                Downloading update...
              </span>
            )}
            {updateProgress.status === "installing" && (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                Installing update...
              </span>
            )}
            {updateProgress.status === "error" && (
              <span className="text-red-600">Error: {updateProgress.error}</span>
            )}
          </div>
        )}

        {pullMessage && (
          <div className="text-sm bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="font-medium text-purple-800">Git Pull Result:</p>
            <pre className="mt-1 text-xs text-purple-700 whitespace-pre-wrap">{pullMessage}</pre>
          </div>
        )}

        {progressBar}

        {updateCheck && (
          <div
            className={cn(
              "rounded-lg border p-4 space-y-2",
              updateCheck.hasUpdate ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200",
            )}
          >
            {updateCheck.hasUpdate ? (
              <>
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    {t("Update available")}: v{updateCheck.latestVersion}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {!isDownloading && !isReadyToInstall && (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t("Download Update")}
                    </button>
                  )}

                  {isDownloading && (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-400 text-white text-sm font-medium cursor-not-allowed"
                    >
                      <Spinner />
                      {t("Downloading...")}
                    </button>
                  )}

                  {isReadyToInstall && (
                    <button
                      type="button"
                      onClick={handleInstallUpdate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {t("Install and Restart")}
                    </button>
                  )}
                </div>

                <a
                  href={updateCheck.downloadUrl || updateCheck.releaseUrl}
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
