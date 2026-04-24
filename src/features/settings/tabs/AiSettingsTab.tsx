import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  RefreshCw,
  Server,
  TestTube2,
  XCircle,
} from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { GlmOcrStatus, SaveSettingsPayload } from "../../../lib/settings-api";
import { cn } from "../../../lib/utils";

type AiProvider = "ollama" | "lmstudio" | "bonsai" | "bitnet";

type OcrEngine = "auto" | "glm-ocr" | "tesseract" | "surya";

const OCR_ENGINES: { value: OcrEngine; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "AI chooses best engine, verifies with vision model" },
  {
    value: "glm-ocr",
    label: "GLM-OCR",
    description: "Uses Ollama with vision model (recommended)",
  },
  { value: "tesseract", label: "Tesseract", description: "Open source OCR, runs locally" },
  { value: "surya", label: "Surya", description: "Modern OCR with layout detection" },
];

const AI_PROVIDERS: { value: AiProvider; label: string; description: string }[] = [
  { value: "ollama", label: "Ollama", description: "Local LLM via Ollama" },
  { value: "lmstudio", label: "LM Studio", description: "Local LLM via LM Studio" },
  { value: "bonsai", label: "Bonsai", description: "Local LLM via Bonsai" },
  { value: "bitnet", label: "BitNet", description: "Microsoft BitNet models" },
];

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ConnectionBadge({ ok, testing }: { ok: boolean | null; testing: boolean }) {
  if (testing) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        <Spinner />
        <span className="truncate">Testing</span>
      </span>
    );
  }

  if (ok === true) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Ready</span>
      </span>
    );
  }

  if (ok === false) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Offline</span>
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Not tested</span>
    </span>
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
  bonsaiUrl: string;
  bonsaiModel: string;
  bitnetUrl: string;
  bitnetModel: string;
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
  ocrAutoPostThreshold: number;
  ocrEngine: OcrEngine;
  ocrVisionVerification: boolean;
  onProviderChange: (p: AiProvider) => void;
  onUrlChange: (url: string) => void;
  onModelChange: (model: string) => void;
  onTestProvider: () => void;
  onFetchModels: () => void;
  onTestGlmocr: () => void;
  onSave: (partial: SaveSettingsPayload) => void;
  onOcrThresholdChange: (value: number) => void;
  onOcrEngineChange: (engine: OcrEngine) => void;
  onOcrVisionVerificationChange: (value: boolean) => void;
}

export function AiSettingsTab({
  aiProvider,
  ollamaUrl,
  ollamaModel,
  lmStudioUrl,
  lmStudioModel,
  bonsaiUrl,
  bonsaiModel,
  bitnetUrl,
  bitnetModel,
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
  ocrAutoPostThreshold,
  ocrEngine,
  ocrVisionVerification,
  onProviderChange,
  onUrlChange,
  onModelChange,
  onTestProvider,
  onFetchModels,
  onTestGlmocr,
  onSave,
  onOcrThresholdChange,
  onOcrEngineChange,
  onOcrVisionVerificationChange,
}: AiSettingsTabProps) {
  const { t } = useI18n();

  const currentModelIsCustom = currentModel.trim() !== "" && !currentModels.includes(currentModel);
  const visibleServerUrl = currentUrl.trim() || defaultUrl;
  const connectionState = testingProvider
    ? {
        icon: <Spinner />,
        title: "Testing connection",
        message: `Checking ${providerLabel} at ${visibleServerUrl}`,
        className: "border-blue-200 bg-blue-50 text-blue-800",
        detailClassName: "text-blue-600",
      }
    : providerStatus === true
      ? {
          icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />,
          title: `${providerLabel} is ready`,
          message: "The AI workspace can use this server for chat and draft creation.",
          className: "border-green-200 bg-green-50 text-green-800",
          detailClassName: "text-green-600",
        }
      : providerStatus === false
        ? {
            icon: <XCircle className="h-4 w-4 shrink-0 text-red-600" />,
            title: "Connection failed",
            message: "Check that the local server is running and the URL is reachable.",
            className: "border-red-200 bg-red-50 text-red-800",
            detailClassName: "text-red-600",
          }
        : {
            icon: <Clock className="h-4 w-4 shrink-0 text-gray-500" />,
            title: "Connection not tested",
            message: "Test the server before relying on this provider.",
            className: "border-gray-200 bg-gray-50 text-gray-800",
            detailClassName: "text-gray-500",
          };

  return (
    <>
      {/* AI Provider Selection - Enhanced styling */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-gray-900">{t("AI Provider")}</h3>
          <ConnectionBadge ok={providerStatus} testing={testingProvider} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_PROVIDERS.map((provider) => (
            <button
              type="button"
              key={provider.value}
              onClick={() => onProviderChange(provider.value)}
              className={cn(
                "min-w-0 rounded-xl border-2 p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                "hover:border-gray-300 hover:shadow-sm",
                aiProvider === provider.value
                  ? "border-blue-600 bg-blue-50 shadow-sm"
                  : "border-gray-200",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-base font-bold",
                      aiProvider === provider.value ? "text-blue-700" : "text-gray-800",
                    )}
                  >
                    {provider.label}
                  </span>
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">
                    {provider.description}
                  </p>
                </div>
                {aiProvider === provider.value && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Server className="h-4 w-4 shrink-0 text-gray-500" />
              <h3 className="truncate text-base font-semibold text-gray-900">
                {providerLabel} {t("Server")}
              </h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Configure the local endpoint and model used by the AI workspace.
            </p>
          </div>
          <ConnectionBadge ok={providerStatus} testing={testingProvider} />
        </div>

        <div className={cn("rounded-lg border px-4 py-3", connectionState.className)}>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              {connectionState.icon}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{connectionState.title}</p>
                <p className={cn("mt-0.5 text-xs", connectionState.detailClassName)}>
                  {connectionState.message}
                </p>
              </div>
            </div>
            <span className="min-w-0 break-all text-xs font-medium">{visibleServerUrl}</span>
          </div>
        </div>

        <div>
          <label htmlFor="ai-server-url" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t("Server URL")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="ai-server-url"
              type="text"
              value={currentUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={defaultUrl}
            />
            <button
              type="button"
              onClick={onTestProvider}
              disabled={testingProvider}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:shrink-0"
            >
              <TestTube2 className="w-4 h-4" />
              {t("Test")}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="ai-model-select"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {t("Model")}
          </label>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Cpu className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <select
                  id="ai-model-select"
                  value={currentModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full min-w-0 appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-8 font-mono text-sm text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title={currentModel || defaultModel}
                >
                  {currentModels.length > 0 && !currentModel && (
                    <option value="">Select a discovered model</option>
                  )}
                  {currentModelIsCustom && (
                    <option value={currentModel}>{currentModel} (custom)</option>
                  )}
                  {currentModels.length === 0 && !currentModel && (
                    <option value="">{t("No models found")}</option>
                  )}
                  {currentModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
              <button
                type="button"
                onClick={onFetchModels}
                disabled={loadingModels}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:shrink-0"
                title={t("Refresh model list")}
              >
                {loadingModels ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
                <span className="sm:sr-only">{t("Refresh model list")}</span>
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate">
                {currentModels.length > 0
                  ? `${currentModels.length} discovered model${currentModels.length === 1 ? "" : "s"}`
                  : "No discovered models yet"}
              </span>
              {currentModelIsCustom && (
                <span className="inline-flex max-w-full items-center rounded-full bg-white px-2 py-0.5 font-medium text-gray-600">
                  <span className="truncate">{t("Custom model")}</span>
                </span>
              )}
            </div>
          </div>
          <input
            type="text"
            value={currentModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="mt-2 w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={defaultModel}
          />
          <p className="mt-1 break-words text-xs text-gray-400">
            {t("Select from dropdown or type a custom model name")}
          </p>
        </div>
      </div>

      {/* OCR Engine Selection - New section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">OCR Engine</h3>
          <StatusDot ok={glmocrStatus} testing={testingGlmocr} />
        </div>

        <p className="text-sm text-gray-500 -mt-3">
          Select which OCR engine to use for document scanning
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OCR_ENGINES.map((engine) => (
            <button
              type="button"
              key={engine.value}
              onClick={() => onOcrEngineChange(engine.value)}
              className={cn(
                "rounded-xl border-2 p-4 text-left transition-all focus:outline-none",
                "hover:shadow-md hover:scale-[1.02]",
                ocrEngine === engine.value
                  ? "border-blue-600 bg-blue-50 shadow-md"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              <span
                className={cn(
                  "text-sm font-bold block",
                  ocrEngine === engine.value ? "text-blue-700" : "text-gray-800",
                )}
              >
                {engine.label}
              </span>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{engine.description}</p>
            </button>
          ))}
        </div>

        {/* Vision verification toggle */}
        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="vision-verify-all"
            checked={ocrVisionVerification}
            onChange={(e) => onOcrVisionVerificationChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="vision-verify-all" className="text-sm text-gray-700">
            Use AI vision model to verify and correct OCR results
          </label>
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          After OCR extraction, the vision model reviews the image to catch missed text, wrong amounts, or formatting errors.
          Adds ~5-10 seconds per document but significantly improves accuracy.
        </p>

        {/* Auto mode info */}
        {ocrEngine === "auto" && (
          <div className="mt-4 bg-indigo-50 rounded-lg border border-indigo-200 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-900">Smart OCR Selection</p>
                <p className="text-xs text-indigo-700 mt-1">
                  Automatically selects the best OCR engine based on availability and document type.
                  Priority: GLM-OCR (vision LLM) → Surya (layout detection) → Tesseract (fast text).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="vision-verify"
                checked={ocrVisionVerification}
                onChange={(e) => onOcrVisionVerificationChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="vision-verify" className="text-xs text-indigo-700">
                Use AI vision model to verify and correct OCR results (improves accuracy)
              </label>
            </div>
          </div>
        )}

        {/* GLM-OCR specifics */}
        {ocrEngine === "glm-ocr" && (
          <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">OCR Model</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {glmocrDetails?.model_name || "glm-ocr:latest"}
                </p>
              </div>
              <button
                type="button"
                onClick={onTestGlmocr}
                disabled={testingGlmocr}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <TestTube2 className="w-4 h-4" />
                {t("Test")}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {glmocrDetails?.message || "Document scanning uses the GLM-OCR model from Ollama."}
            </p>
            <p className="text-xs text-gray-400">
              Install:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded">ollama pull glm-ocr:latest</code>
            </p>
          </div>
        )}

        {/* Tesseract info */}
        {ocrEngine === "tesseract" && (
          <div className="mt-4 bg-blue-50 rounded-lg border border-blue-200 p-4">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Tesseract OCR</span> — Uses the system Tesseract
              installation for document scanning. Install via Homebrew:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded">brew install tesseract</code>
            </p>
          </div>
        )}

        {/* Surya info */}
        {ocrEngine === "surya" && (
          <div className="mt-4 bg-green-50 rounded-lg border border-green-200 p-4">
            <p className="text-sm text-green-800">
              <span className="font-medium">Surya OCR</span> — Modern OCR with layout detection
              capabilities. Install via pip:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded">pip install surya-ocr</code>
            </p>
          </div>
        )}
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
              {t("Draft from files/photos")}
            </span>
            <input
              type="checkbox"
              defaultChecked
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
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

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900">{t("OCR Auto-Post Threshold")}</h3>
        <p className="text-xs text-gray-500">
          {t(
            "Drafts with OCR confidence below this threshold will show a review badge and require manual confirmation before posting.",
          )}
        </p>
        <div className="flex items-center gap-4">
          <label htmlFor="ocr-threshold" className="text-sm font-medium text-gray-700 shrink-0">
            {t("Minimum confidence")}
          </label>
          <input
            id="ocr-threshold"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={ocrAutoPostThreshold}
            onChange={(e) => onOcrThresholdChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-mono text-gray-700 w-10 text-right">
            {Math.round(ocrAutoPostThreshold * 100)}%
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            onSave({
              ai_provider: aiProvider,
              ollama_url: ollamaUrl,
              ollama_model: ollamaModel,
              lm_studio_url: lmStudioUrl,
              lm_studio_model: lmStudioModel,
              bonsai_url: bonsaiUrl,
              bonsai_model: bonsaiModel,
              bitnet_url: bitnetUrl,
              bitnet_model: bitnetModel,
              ocr_auto_post_threshold: ocrAutoPostThreshold,
              ocr_engine: ocrEngine,
              ocr_vision_verification: ocrVisionVerification,
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
