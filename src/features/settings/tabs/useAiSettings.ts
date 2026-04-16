import { useState, useEffect, useCallback } from "react";
import {
  ollamaHealthUrl,
  ollamaListModels,
  lmstudioHealth,
  lmstudioListModels,
  getGlmocrStatus,
} from "../../../lib/settings-api";
import type { GlmOcrStatus } from "../../../lib/settings-api";
import { isOcrOrNonChatModel, pickPreferredOllamaModel } from "./settingsUtils";

export type AiProvider = "ollama" | "lmstudio";

export interface AiSettingsState {
  aiProvider: AiProvider;
  ollamaUrl: string;
  ollamaModel: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  providerStatus: boolean | null;
  glmocrStatus: boolean | null;
  glmocrDetails: GlmOcrStatus | null;
  testingProvider: boolean;
  testingGlmocr: boolean;
  loadingModels: boolean;
  // derived
  currentModels: string[];
  currentModel: string;
  currentUrl: string;
  defaultUrl: string;
  defaultModel: string;
  providerLabel: string;
  // setters / actions
  setAiProvider: (p: AiProvider) => void;
  setCurrentUrl: (url: string) => void;
  setCurrentModel: (model: string) => void;
  setProviderStatus: (ok: boolean | null) => void;
  testProvider: () => Promise<void>;
  fetchModels: () => Promise<void>;
  testGlmocr: () => Promise<void>;
  // initialise from persisted settings
  initFromSettings: (s: {
    ai_provider?: string;
    ollama_url?: string;
    ollama_model?: string;
    lm_studio_url?: string;
    lm_studio_model?: string;
  }) => void;
}

export function useAiSettings(): AiSettingsState {
  const [aiProvider, setAiProvider] = useState<AiProvider>("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("");
  const [lmStudioUrl, setLmStudioUrl] = useState("http://localhost:1234");
  const [lmStudioModel, setLmStudioModel] = useState("");

  const [providerStatus, setProviderStatus] = useState<boolean | null>(null);
  const [glmocrStatus, setGlmocrStatus] = useState<boolean | null>(null);
  const [glmocrDetails, setGlmocrDetails] = useState<GlmOcrStatus | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [testingGlmocr, setTestingGlmocr] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmStudioModels, setLmStudioModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const testProvider = useCallback(async () => {
    setTestingProvider(true);
    try {
      const ok = aiProvider === "lmstudio" ? await lmstudioHealth(lmStudioUrl) : await ollamaHealthUrl(ollamaUrl);
      setProviderStatus(ok);
    } catch { setProviderStatus(false); }
    finally { setTestingProvider(false); }
  }, [aiProvider, ollamaUrl, lmStudioUrl]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      if (aiProvider === "lmstudio") {
        const models = await lmstudioListModels(lmStudioUrl);
        setLmStudioModels(models);
        if ((!lmStudioModel || !models.includes(lmStudioModel)) && models.length > 0) setLmStudioModel(models[0]);
      } else {
        const models = await ollamaListModels(ollamaUrl);
        setOllamaModels(models);
        const preferred = pickPreferredOllamaModel(models);
        const currentStillValid = ollamaModel && models.includes(ollamaModel) && !isOcrOrNonChatModel(ollamaModel);
        if (!currentStillValid && preferred) setOllamaModel(preferred);
      }
    } catch {
      if (aiProvider === "lmstudio") setLmStudioModels([]);
      else setOllamaModels([]);
    } finally { setLoadingModels(false); }
  }, [aiProvider, ollamaUrl, lmStudioUrl, ollamaModel, lmStudioModel]);

  const testGlmocr = useCallback(async () => {
    setTestingGlmocr(true);
    try {
      const status = await getGlmocrStatus(ollamaUrl);
      setGlmocrDetails(status);
      setGlmocrStatus(status.available);
    } catch { setGlmocrDetails(null); setGlmocrStatus(false); }
    finally { setTestingGlmocr(false); }
  }, [ollamaUrl]);

  useEffect(() => { void fetchModels(); }, [fetchModels]);
  useEffect(() => { if (aiProvider === "ollama") void testGlmocr(); }, [aiProvider, ollamaUrl, testGlmocr]);

  const initFromSettings = useCallback((s: {
    ai_provider?: string;
    ollama_url?: string;
    ollama_model?: string;
    lm_studio_url?: string;
    lm_studio_model?: string;
  }) => {
    if (s.ai_provider) setAiProvider(s.ai_provider as AiProvider);
    if (s.ollama_url) setOllamaUrl(s.ollama_url);
    if (s.ollama_model !== undefined) setOllamaModel(s.ollama_model);
    if (s.lm_studio_url) setLmStudioUrl(s.lm_studio_url);
    if (s.lm_studio_model !== undefined) setLmStudioModel(s.lm_studio_model);
  }, []);

  const currentModels = aiProvider === "lmstudio" ? lmStudioModels : ollamaModels.filter((m) => !isOcrOrNonChatModel(m));
  const currentModel = aiProvider === "lmstudio" ? lmStudioModel : ollamaModel;
  const currentUrl = aiProvider === "lmstudio" ? lmStudioUrl : ollamaUrl;
  const setCurrentUrl = aiProvider === "lmstudio" ? setLmStudioUrl : setOllamaUrl;
  const setCurrentModel = aiProvider === "lmstudio" ? setLmStudioModel : setOllamaModel;
  const defaultUrl = aiProvider === "lmstudio" ? "http://localhost:1234" : "http://localhost:11434";
  const defaultModel = aiProvider === "lmstudio" ? "" : pickPreferredOllamaModel(currentModels);
  const providerLabel = aiProvider === "lmstudio" ? "LM Studio" : "Ollama";

  return {
    aiProvider, ollamaUrl, ollamaModel, lmStudioUrl, lmStudioModel,
    providerStatus, glmocrStatus, glmocrDetails,
    testingProvider, testingGlmocr, loadingModels,
    currentModels, currentModel, currentUrl, defaultUrl, defaultModel, providerLabel,
    setAiProvider, setCurrentUrl, setCurrentModel, setProviderStatus,
    testProvider, fetchModels, testGlmocr, initFromSettings,
  };
}
