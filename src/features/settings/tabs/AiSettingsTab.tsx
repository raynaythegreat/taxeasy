import { CheckCircle2, ChevronDown, RefreshCw, TestTube2, XCircle } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { GlmOcrStatus, SaveSettingsPayload } from "../../../lib/settings-api";
import { cn } from "../../../lib/utils";

type AiProvider = "ollama" | "lmstudio";

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

export interface AiSettingsTabProps {
  aiProvider: AiProvider;
  ollamaUrl: string;
  ollamaModel: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  currentModels: string[];
  currentModel: string;
  currentUrl: string;
  defaultUrl: string;
  defaultModel: string;
  providerLabel: string;
  providerStatus: boolean | null;
  testingProvider: boolean;
  loadingModels: boolean;
  glmocrStatus: boolean | null;
  glmocrDetails: GlmOcrStatus | null;
  testingGlmocr: boolean;
  saving: boolean;
  onProviderChange: (p: AiProvider) => void;
  onUrlChange: (url: string) => void;
  onModelChange: (model: string) => void;
  onTestProvider: () => void;
  onFetchModels: () => void;
  onTestGlmocr: () => void;
  onSave: (partial: SaveSettingsPayload) => void;
}

export function AiSettingsTab({
  aiProvider,
  ollamaUrl,
  ollamaModel,
  lmStudioUrl,
  lmStudioModel,
  currentModels,
  currentModel,
  currentUrl,
  defaultUrl,
  defaultModel,
  providerLabel,
  providerStatus,
  testingProvider,
  loadingModels,
  glmocrStatus,
  glmocrDetails,
  testingGlmocr,
  saving,
  onProviderChange,
  onUrlChange,
  onModelChange,
  onTestProvider,
  onFetchModels,
  onTestGlmocr,
  onSave,
}: AiSettingsTabProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900">{t("AI Provider")}</h3>

        <div className="grid grid-cols-2 gap-3">
          {(["ollama", "lmstudio"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onProviderChange(p)}
              className={cn(
                "rounded-xl border-2 p-4 text-center transition-colors focus:outline-none",
                aiProvider === p
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              <span
                className={cn(
                  "text-sm font-semibold",
                  aiProvider === p ? "text-blue-700" : "text-gray-700",
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
        <h3 className="text-sm font-semibold text-gray-900">
          {providerLabel} {t("Server")}
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t("Server URL")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder={defaultUrl}
            />
            <button
              onClick={onTestProvider}
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("Model")}</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={currentModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors appearance-none pr-8"
              >
                {currentModels.length === 0 && <option value="">{t("No models found")}</option>}
                {currentModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={onFetchModels}
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
            onChange={(e) => onModelChange(e.target.value)}
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

        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{t("OCR Model")}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {glmocrDetails?.model_name || "glm-ocr:latest"}
                </p>
              </div>
              <StatusDot ok={glmocrStatus} testing={testingGlmocr} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {glmocrDetails?.message || t("Document scanning uses the GLM-OCR model from Ollama.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onTestGlmocr}
              disabled={testingGlmocr}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <TestTube2 className="w-4 h-4" />
              {t("Test OCR Model")}
            </button>
            <span className="text-xs text-gray-400">
              {t("Install with")}: <code>ollama pull glm-ocr:latest</code>
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900">{t("ai.workspaceTitle")}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{t("ai.localBadge")}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                {t("Local only")}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {t("All AI processing happens on your device")}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-900">{t("Draft from chat text")}</span>
            <input
              type="checkbox"
              defaultChecked
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-900">
              {t("Draft from files/photos")}
            </span>
            <input
              type="checkbox"
              defaultChecked
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-900">
              {t("Require approval before posting")}
            </span>
            <input
              type="checkbox"
              defaultChecked
              disabled
              className="w-4 h-4 rounded border-gray-300 text-gray-400 bg-gray-100 cursor-not-allowed"
            />
            <span className="text-xs text-gray-400 ml-2">{t("Required in v1")}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900">{t("Grounding Controls")}</h3>

        <div className="space-y-2 text-sm">
          {[
            t("Client business profile"),
            t("Client uploaded documents"),
            t("Client posted transactions"),
            t("Client chart of accounts"),
            t("Client notes"),
          ].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-gray-700">{label}</span>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {[t("Other clients' data"), t("Internet-based APIs"), t("System files or OS data")].map(
              (label) => (
                <div key={label} className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-gray-400">{label}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() =>
            onSave({
              ai_provider: aiProvider,
              ollama_url: ollamaUrl,
              ollama_model: ollamaModel,
              lm_studio_url: lmStudioUrl,
              lm_studio_model: lmStudioModel,
            })
          }
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Spinner />}
          {t("Save AI Settings")}
        </button>
      </div>
    </>
  );
}
