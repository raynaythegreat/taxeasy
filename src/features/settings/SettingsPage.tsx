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
} from "lucide-react";
import { getSettings, saveSettings, ollamaHealth, glmocrCheckAvailable } from "../../lib/settings-api";
import type { SaveSettingsPayload } from "../../lib/settings-api";
import { backupDatabase, restoreDatabase } from "../../lib/backup-api";
import { cn } from "../../lib/utils";
import { BackupRestoreCard } from "./BackupRestoreCard";

type SettingsTab = "ai" | "appearance" | "data" | "about";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "ai", label: "AI Configuration", icon: BrainCircuit },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data Management", icon: Database },
  { id: "about", label: "About", icon: Info },
];

function Spinner() {
  return (
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("qwen2.5:7b-instruct");
  const [glmocrPath, setGlmocrPath] = useState("");
  const [theme, setTheme] = useState("system");
  const [exportPath, setExportPath] = useState("");

  const [ollamaStatus, setOllamaStatus] = useState<boolean | null>(null);
  const [glmocrStatus, setGlmocrStatus] = useState<boolean | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [testingGlmocr, setTestingGlmocr] = useState(false);

  const [confirmRestore, setConfirmRestore] = useState(false);

  const {
    data: settings,
    isLoading,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    retry: false,
  });

  useEffect(() => {
    if (settings) {
      setOllamaUrl(settings.ollama_url || "http://localhost:11434");
      setOllamaModel(settings.ollama_model || "qwen2.5:7b-instruct");
      setGlmocrPath(settings.glmocr_path || "");
      setTheme(settings.theme || "system");
      setExportPath(settings.default_export_path || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: SaveSettingsPayload) => saveSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      showToast("Settings saved", "success");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed to save: ${msg}`, "error");
    },
  });

  const backupMutation = useMutation({
    mutationFn: backupDatabase,
    onSuccess: (path) => {
      showToast(`Backup saved to ${path}`, "success");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Backup failed: ${msg}`, "error");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDatabase,
    onSuccess: () => {
      setConfirmRestore(false);
      showToast("Data restored successfully", "success");
      queryClient.invalidateQueries();
    },
    onError: (err: unknown) => {
      setConfirmRestore(false);
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Restore failed: ${msg}`, "error");
    },
  });

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave(partial: SaveSettingsPayload) {
    saveMutation.mutate(partial);
  }

  const testOllama = useCallback(async () => {
    setTestingOllama(true);
    try {
      const ok = await ollamaHealth();
      setOllamaStatus(ok);
    } catch {
      setOllamaStatus(false);
    } finally {
      setTestingOllama(false);
    }
  }, [ollamaUrl]);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-gray-700" />
          <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
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
                {tab.label}
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
                <h3 className="text-sm font-semibold text-gray-900">Ollama Server</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Server URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    />
                    <button
                      onClick={testOllama}
                      disabled={testingOllama}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <TestTube2 className="w-4 h-4" />
                      Test
                    </button>
                    <StatusDot ok={ollamaStatus} testing={testingOllama} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="qwen2.5:7b-instruct"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                <h3 className="text-sm font-semibold text-gray-900">GLM-OCR</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Binary Path
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
                      Test
                    </button>
                    <StatusDot ok={glmocrStatus} testing={testingGlmocr} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() =>
                    handleSave({
                      ollama_url: ollamaUrl,
                      ollama_model: ollamaModel,
                      glmocr_path: glmocrPath,
                    })
                  }
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveMutation.isPending && <Spinner />}
                  Save AI Settings
                </button>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-900">Theme</h3>

              <div className="grid grid-cols-3 gap-3">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-center transition-colors focus:outline-none",
                      theme === t
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg mx-auto mb-2 border",
                        t === "light" && "bg-white border-gray-300",
                        t === "dark" && "bg-gray-900 border-gray-700",
                        t === "system" && "bg-gradient-to-br from-white to-gray-900 border-gray-400"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium capitalize",
                        theme === t ? "text-blue-700" : "text-gray-700"
                      )}
                    >
                      {t}
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
                  Save Appearance
                </button>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-4">
              <BackupRestoreCard
                title="Backup Client Data"
                description="Create a complete backup of all client data, transactions, and settings. The backup will be saved as a file you choose."
                buttonText="Backup Client Data"
                buttonIcon={HardDriveUpload}
                onAction={() => backupMutation.mutate()}
                loading={backupMutation.isPending}
                variant="primary"
              />

              <BackupRestoreCard
                title="Restore from Backup"
                description="Restore all data from a previously created backup file. This will replace all current data."
                buttonText="Restore from Backup"
                buttonIcon={HardDriveDownload}
                onAction={() => setConfirmRestore(true)}
                loading={restoreMutation.isPending}
                variant="danger"
              />

              <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Export All Transactions</h4>
                <p className="text-sm text-gray-500">
                  Download all transactions across all clients as a CSV file.
                </p>
                <button
                  onClick={() => handleSave({ default_export_path: exportPath })}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  Export All Transactions (CSV)
                </button>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Taxeasy</h2>
                <p className="text-sm text-gray-500 mt-1">Local-first bookkeeping</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Version</span>
                  <span className="text-sm font-medium text-gray-900">0.1.0</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Tech Stack</span>
                  <span className="text-sm font-medium text-gray-900">
                    Tauri, React, and SQLite
                  </span>
                </div>
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
              <h3 className="text-base font-semibold text-gray-900">Confirm Restore</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              This will overwrite all your current data with the backup. This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmRestore(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {restoreMutation.isPending && <Spinner />}
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
