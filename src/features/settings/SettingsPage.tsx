import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Database, Info, Lock, Palette, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { backupDatabase, restoreDatabase } from "../../lib/backup-api";
import { useI18n } from "../../lib/i18n";
import type { SaveSettingsPayload } from "../../lib/settings-api";
import { getSettings, saveSettings } from "../../lib/settings-api";
import { useTheme } from "../../lib/theme";
import type { UpdateCheck } from "../../lib/updater-api";
import { checkForUpdates, getAppVersion } from "../../lib/updater-api";
import { cn } from "../../lib/utils";
import { AboutTab } from "./tabs/AboutTab";
import { AiSettingsTab } from "./tabs/AiSettingsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { ConfirmRestoreModal } from "./tabs/ConfirmRestoreModal";
import { DataManagementTab } from "./tabs/DataManagementTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { useAiSettings } from "./tabs/useAiSettings";

type SettingsTab = "ai" | "appearance" | "data" | "security" | "about";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "ai", label: "AI Configuration", icon: BrainCircuit },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data Management", icon: Database },
  { id: "security", label: "Security", icon: Lock },
  { id: "about", label: "About", icon: Info },
];

export function SettingsPage(_props: { onBack?: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const { theme, setTheme } = useTheme();
  const [exportPath, setExportPath] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const ai = useAiSettings();
  const [ocrAutoPostThreshold, setOcrAutoPostThreshold] = useState(0.7);

  useEffect(() => {
    getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("0.1.0"));
  }, []);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    retry: false,
  });

  // Sync stored settings → UI state ONCE on initial load. Without the ref,
  // any later change to `theme` (or re-fetch of settings) re-runs this effect
  // and reverts the user's live selection back to the stored value — which
  // made the light/dark toggle feel "locked" to the stored choice.
  const didHydrateFromSettings = useRef(false);
  useEffect(() => {
    if (!settings || didHydrateFromSettings.current) return;
    ai.initFromSettings(settings);
    if (settings.theme) {
      setTheme(settings.theme as "light" | "dark" | "system");
    }
    setExportPath(settings.default_export_path || "");
    if (settings.ocr_auto_post_threshold !== undefined) {
      setOcrAutoPostThreshold(settings.ocr_auto_post_threshold);
    }
    didHydrateFromSettings.current = true;
  }, [settings, setTheme, ai.initFromSettings]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

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
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
      </div>
    );
  }

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
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100",
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
            <AiSettingsTab
              aiProvider={ai.aiProvider}
              ollamaUrl={ai.ollamaUrl}
              ollamaModel={ai.ollamaModel}
              lmStudioUrl={ai.lmStudioUrl}
              lmStudioModel={ai.lmStudioModel}
              currentModels={ai.currentModels}
              currentModel={ai.currentModel}
              currentUrl={ai.currentUrl}
              defaultUrl={ai.defaultUrl}
              defaultModel={ai.defaultModel}
              providerLabel={ai.providerLabel}
              providerStatus={ai.providerStatus}
              testingProvider={ai.testingProvider}
              loadingModels={ai.loadingModels}
              glmocrStatus={ai.glmocrStatus}
              glmocrDetails={ai.glmocrDetails}
              testingGlmocr={ai.testingGlmocr}
              saving={saveMutation.isPending}
              onProviderChange={(p) => {
                ai.setAiProvider(p);
                ai.setProviderStatus(null);
              }}
              onUrlChange={ai.setCurrentUrl}
              onModelChange={ai.setCurrentModel}
              onTestProvider={ai.testProvider}
              onFetchModels={ai.fetchModels}
              onTestGlmocr={ai.testGlmocr}
              ocrAutoPostThreshold={ocrAutoPostThreshold}
              onOcrThresholdChange={setOcrAutoPostThreshold}
              onSave={(partial) => saveMutation.mutate(partial)}
            />
          )}
          {activeTab === "appearance" && (
            <AppearanceTab
              theme={theme}
              saving={saveMutation.isPending}
              onThemeChange={setTheme}
              onSave={(p) => saveMutation.mutate(p)}
            />
          )}
          {activeTab === "data" && (
            <DataManagementTab
              exportPath={exportPath}
              backupLoading={backupMutation.isPending}
              restoreLoading={restoreMutation.isPending}
              saving={saveMutation.isPending}
              onBackup={() => backupMutation.mutate()}
              onRestoreRequest={() => setConfirmRestore(true)}
              onSave={(p) => saveMutation.mutate(p)}
            />
          )}
          {activeTab === "security" && (
            <SecurityTab saving={saveMutation.isPending} onSave={(p) => saveMutation.mutate(p)} />
          )}
          {activeTab === "about" && (
            <AboutTab
              appVersion={appVersion}
              updateCheck={updateCheck}
              checkingUpdate={checkingUpdate}
              onCheckUpdate={handleCheckUpdate}
            />
          )}
        </div>
      </div>

      {confirmRestore && (
        <ConfirmRestoreModal
          restoring={restoreMutation.isPending}
          onConfirm={() => restoreMutation.mutate()}
          onCancel={() => setConfirmRestore(false)}
        />
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
