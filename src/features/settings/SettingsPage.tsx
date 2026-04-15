import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  BrainCircuit,
  Palette,
  Database,
  Info,
  TestTube2,
  CheckCircle2,
  XCircle,
  HardDriveUpload,
  HardDriveDownload,
  FileDown,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  getSettings,
  saveSettings,
  ollamaHealthUrl,
  ollamaListModels,
  lmstudioHealth,
  lmstudioListModels,
  glmocrCheckAvailable,
} from "../../lib/settings-api";
import type { SaveSettingsPayload } from "../../lib/settings-api";
import { backupDatabase, restoreDatabase } from "../../lib/backup-api";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { BackupRestoreCard } from "./BackupRestoreCard";
import { checkForUpdates, getAppVersion } from "../../lib/updater-api";
import type { UpdateCheck } from "../../lib/updater-api";

type SettingsTab = "ai" | "appearance" | "data" | "about";
type AiProvider = "ollama" | "lmstudio";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "ai", label: "AI Configuration", icon: BrainCircuit },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data Management", icon: Database },
  { id: "about", label: "About", icon: Info },
];

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function StatusDot({ ok, testing }: { ok: boolean | null; testing: boolean }) {
  if (testing) return <Spinner />;
  if (ok === null) return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />;
  return ok ? (
    <CheckCircle2 className="w-5 h-5 text-green-500" />
  ) : (
    <XCircle className="w-5 h-5 text-red-500" />
  );
}

export function SettingsPage(_props: { onBack?: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [aiProvider, setAiProvider] = useState<AiProvider>("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("glm-ocr:latest");
  const [lmStudioUrl, setLmStudioUrl] = useState("http://localhost:1234");
  const [lmStudioModel, setLmStudioModel] = useState("");
  const [glmocrPath, setGlmocrPath] = useState("");
  const { theme, setTheme } = useTheme();
  const [exportPath, setExportPath] = useState("");

  const [providerStatus, setProviderStatus] = useState<boolean | null>(null);
  const [glmocrStatus, setGlmocrStatus] = useState<boolean | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [testingGlmocr, setTestingGlmocr] = useState(false);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmStudioModels, setLmStudioModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const [confirmRestore, setConfirmRestore] = useState(false);

  const [appVersion, setAppVersion] = useState("");
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => setAppVersion("0.1.0"));
  }, []);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    retry: false,
  });

  useEffect(() => {
    if (settings) {
      setAiProvider((settings.ai_provider as AiProvider) || "ollama");
      setOllamaUrl(settings.ollama_url || "http://localhost:11434");
      setOllamaModel(settings.ollama_model || "glm-ocr:latest");
      setLmStudioUrl(settings.lm_studio_url || "http://localhost:1234");
      setLmStudioModel(settings.lm_studio_model || "");
      setGlmocrPath(settings.glmocr_path || "");
      if (settings.theme && settings.theme !== theme) {
        setTheme(settings.theme as "light" | "dark" | "system");
      }
      setExportPath(settings.default_export_path || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: SaveSettingsPayload) => saveSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      showToast(t("Settings saved"), "success");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`${t("Failed to save")}: ${msg}`, "error");
    },
  });

  const backupMutation = useMutation({
    mutationFn: backupDatabase,
    onSuccess: (path) => showToast(t("Backup saved to {path}", { path }), "success"),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`${t("Backup failed")}: ${msg}`, "error");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDatabase,
    onSuccess: () => {
      setConfirmRestore(false);
      showToast(t("Data restored successfully"), "success");
      queryClient.invalidateQueries();
    },
    onError: (err: unknown) => {
      setConfirmRestore(false);
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`${t("Restore failed")}: ${msg}`, "error");
    },
  });

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave(partial: SaveSettingsPayload) {
    saveMutation.mutate(partial);
  }

  const testProvider = useCallback(async () => {
    setTestingProvider(true);
    try {
      const ok =
        aiProvider === "lmstudio"
          ? await lmstudioHealth(lmStudioUrl)
          : await ollamaHealthUrl(ollamaUrl);
      setProviderStatus(ok);
    } catch {
      setProviderStatus(false);
    } finally {
      setTestingProvider(false);
    }
  }, [aiProvider, ollamaUrl, lmStudioUrl]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      if (aiProvider === "lmstudio") {
        const models = await lmstudioListModels(lmStudioUrl);
        setLmStudioModels(models);
      } else {
        const models = await ollamaListModels(ollamaUrl);
        setOllamaModels(models);
      }
    } catch {
      if (aiProvider === "lmstudio") setLmStudioModels([]);
      else setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [aiProvider, ollamaUrl, lmStudioUrl]);

  const testGlmocr = useCallback(async () => {
    setTestingGlmocr(true);
    try {
      const ok = await glmocrCheckAvailable();
      setGlmocrStatus(ok);
    } catch {
      setGlmocrStatus(false);
    } finally {
      setTestingGlmocr(false);
    }
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkForUpdates();
      setUpdateCheck(result);
    } catch {
      setUpdateCheck(null);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  const currentModels = aiProvider === "lmstudio" ? lmStudioModels : ollamaModels;
  const currentModel = aiProvider === "lmstudio" ? lmStudioModel : ollamaModel;
  const currentUrl = aiProvider === "lmstudio" ? lmStudioUrl : ollamaUrl;
  const setCurrentUrl = aiProvider === "lmstudio" ? setLmStudioUrl : setOllamaUrl;
  const setCurrentModel = aiProvider === "lmstudio" ? setLmStudioModel : setOllamaModel;
  const defaultUrl = aiProvider === "lmstudio" ? "http://localhost:1234" : "http://localhost:11434";
  const defaultModel = aiProvider === "lmstudio" ? "" : "glm-ocr:latest";
  const providerLabel = aiProvider === "lmstudio" ? "LM Studio" : "Ollama";

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-gray-700" />
          <h1 className="text-lg font-semibold text-gray-900">{t("Settings")}</h1>
        </div>
      </div>

      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-2">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Icon className="w-4 h-4" />
                {t(tab.label)}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-2xl mx-auto py-6 px-6 space-y-6">
          {activeTab === "ai" && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <h3 className="text-sm font-semibold text-gray-900">{t("AI Provider")}</h3>

                <div className="grid grid-cols-2 gap-3">
                  {(["ollama", "lmstudio"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setAiProvider(p);
                        setProviderStatus(null);
                      }}
                      className={cn(
                        "rounded-xl border-2 p-4 text-center transition-colors focus:outline-none",
                        aiProvider === p
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          aiProvider === p ? "text-blue-700" : "text-gray-700"
                        )}
                      >
                        {p === "ollama" ? "Ollama" : "LM Studio"}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {p === "ollama" ? "Local LLM via Ollama" : "Local LLM via LM Studio"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <h3 className="text-sm font-semibold text-gray-900">{providerLabel} {t("Server")}</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t("Server URL")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentUrl}
                      onChange={(e) => setCurrentUrl(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder={defaultUrl}
                    />
                    <button
                      onClick={testProvider}
                      disabled={testingProvider}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <TestTube2 className="w-4 h-4" />
                      {t("Test")}
                    </button>
                    <StatusDot ok={providerStatus} testing={testingProvider} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t("Model")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        value={currentModel}
                        onChange={(e) => setCurrentModel(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors appearance-none pr-8"
                      >
                        {currentModels.length === 0 && (
                          <option value="">{t("No models found")}</option>
                        )}
                        {currentModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={fetchModels}
                      disabled={loadingModels}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      title={t("Refresh model list")}
                    >
                      {loadingModels ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                  </div>
                  {currentModels.length === 0 && currentModel && (
                    <p className="mt-1 text-xs text-gray-400">
                      {t("Custom model")}: {currentModel}
                    </p>
                  )}
                  <input
                    type="text"
                    value={currentModel}
                    onChange={(e) => setCurrentModel(e.target.value)}
                    className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder={defaultModel}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {t("Select from dropdown or type a custom model name")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <h3 className="text-sm font-semibold text-gray-900">{t("GLM-OCR")}</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t("Binary Path")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={glmocrPath}
                      onChange={(e) => setGlmocrPath(e.target.value)}
                      placeholder="Auto-detect"
                      className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    />
                    <button
                      onClick={testGlmocr}
                      disabled={testingGlmocr}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <TestTube2 className="w-4 h-4" />
                      {t("Test")}
                    </button>
                    <StatusDot ok={glmocrStatus} testing={testingGlmocr} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() =>
                    handleSave({
                      ai_provider: aiProvider,
                      ollama_url: ollamaUrl,
                      ollama_model: ollamaModel,
                      lm_studio_url: lmStudioUrl,
                      lm_studio_model: lmStudioModel,
                      glmocr_path: glmocrPath,
                    })
                  }
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveMutation.isPending && <Spinner />}
                  {t("Save AI Settings")}
                </button>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-900">{t("Theme")}</h3>

              <div className="grid grid-cols-3 gap-3">
                {(["light", "dark", "system"] as const).map((th) => (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-center transition-colors focus:outline-none",
                      theme === th
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg mx-auto mb-2 border",
                        th === "light" && "bg-white border-gray-300",
                        th === "dark" && "bg-gray-900 border-gray-700",
                        th === "system" && "bg-gradient-to-br from-white to-gray-900 border-gray-400"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        theme === th ? "text-blue-700" : "text-gray-700"
                      )}
                    >
                      {t(th === "light" ? "Light" : th === "dark" ? "Dark" : "System")}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => handleSave({ theme })}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveMutation.isPending && <Spinner />}
                  {t("Save Appearance")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-4">
              <BackupRestoreCard
                title={t("Backup Client Data")}
                description={t("Create a complete backup of all client data, transactions, and settings. The backup will be saved as a file you choose.")}
                buttonText={t("Backup Client Data")}
                buttonIcon={HardDriveUpload}
                onAction={() => backupMutation.mutate()}
                loading={backupMutation.isPending}
                variant="primary"
              />

              <BackupRestoreCard
                title={t("Restore from Backup")}
                description={t("Restore all data from a previously created backup file. This will replace all current data.")}
                buttonText={t("Restore from Backup")}
                buttonIcon={HardDriveDownload}
                onAction={() => setConfirmRestore(true)}
                loading={restoreMutation.isPending}
                variant="danger"
              />

              <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">{t("Export All Transactions")}</h4>
                <p className="text-sm text-gray-500">
                  {t("Download all transactions across all clients as a CSV file.")}
                </p>
                <button
                  onClick={() => handleSave({ default_export_path: exportPath })}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  {t("Export All Transactions (CSV)")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "about" && (
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
                    onClick={handleCheckUpdate}
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
          )}
        </div>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">{t("Confirm Restore")}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t("This will overwrite all your current data with the backup. This action cannot be undone.")}
            </p>
            <div className="flex items-center gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmRestore(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {restoreMutation.isPending && <Spinner />}
                {t("Restore")}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
