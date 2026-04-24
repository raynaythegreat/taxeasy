import { useCallback, useEffect, useState } from "react";
import type { GlmOcrStatus } from "../../../lib/settings-api";
import {
  bonsaiHealth,
  bonsaiListModels,
  bitnetHealth,
  bitnetListModels,
  getGlmocrStatus,
  lmstudioHealth,
  lmstudioListModels,
  ollamaHealthUrl,
  ollamaListModels,
} from "../../../lib/settings-api";
import { isOcrOrNonChatModel, pickPreferredOllamaModel } from "./settingsUtils";

export type AiProvider = "ollama" | "lmstudio" | "bonsai" | "bitnet";

export interface AiSettingsState {
  aiProvider: AiProvider;
  ollamaUrl: string;
  ollamaModel: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  bonsaiUrl: string;
  bonsaiModel: string;
  bitnetUrl: string;
  bitnetModel: string;
  providerStatus: boolean | null;
  glmocrStatus: boolean | null;
  glmocrDetails: GlmOcrStatus | null;
  testingProvider: boolean;
  testingGlmocr: boolean;
  loadingModels: boolean;
  currentModels: string[];
  currentModel: string;
  currentUrl: string;
  defaultUrl: string;
  defaultModel: string;
  providerLabel: string;
  setAiProvider: (p: AiProvider) => void;
  setCurrentUrl: (url: string) => void;
  setCurrentModel: (model: string) => void;
  setProviderStatus: (ok: boolean | null) => void;
  testProvider: () => Promise<void>;
  fetchModels: () => Promise<void>;
  testGlmocr: () => Promise<void>;
  initFromSettings: (s: {
    ai_provider?: string;
    ollama_url?: string;
    ollama_model?: string;
    lm_studio_url?: string;
    lm_studio_model?: string;
    bonsai_url?: string;
    bonsai_model?: string;
    bitnet_url?: string;
    bitnet_model?: string;
  }) => void;
}

export function useAiSettings(): AiSettingsState {
  const [aiProvider, setAiProvider] = useState<AiProvider>("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("");
  const [lmStudioUrl, setLmStudioUrl] = useState("http://localhost:1234");
  const [lmStudioModel, setLmStudioModel] = useState("");
  const [bonsaiUrl, setBonsaiUrl] = useState("http://localhost:8080");
  const [bonsaiModel, setBonsaiModel] = useState("");
  const [bitnetUrl, setBitnetUrl] = useState("http://localhost:8090");
  const [bitnetModel, setBitnetModel] = useState("");

  const [providerStatus, setProviderStatus] = useState<boolean | null>(null);
  const [glmocrStatus, setGlmocrStatus] = useState<boolean | null>(null);
  const [glmocrDetails, setGlmocrDetails] = useState<GlmOcrStatus | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [testingGlmocr, setTestingGlmocr] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmStudioModels, setLmStudioModels] = useState<string[]>([]);
  const [bonsaiModels, setBonsaiModels] = useState<string[]>([]);
  const [bitnetModels, setBitnetModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const testProvider = useCallback(async () => {
    setTestingProvider(true);
    try {
      let ok: boolean;
      if (aiProvider === "lmstudio") {
        ok = await lmstudioHealth(lmStudioUrl);
      } else if (aiProvider === "bonsai") {
        ok = await bonsaiHealth(bonsaiUrl);
      } else if (aiProvider === "bitnet") {
        ok = await bitnetHealth(bitnetUrl);
      } else {
        ok = await ollamaHealthUrl(ollamaUrl);
      }
      setProviderStatus(ok);
    } catch {
      setProviderStatus(false);
    } finally {
      setTestingProvider(false);
    }
  }, [aiProvider, ollamaUrl, lmStudioUrl, bonsaiUrl, bitnetUrl]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      if (aiProvider === "lmstudio") {
        const models = await lmstudioListModels(lmStudioUrl);
        setLmStudioModels(models);
        if ((!lmStudioModel || !models.includes(lmStudioModel)) && models.length > 0)
          setLmStudioModel(models[0]);
      } else if (aiProvider === "bonsai") {
        const models = await bonsaiListModels(bonsaiUrl);
        setBonsaiModels(models);
        if ((!bonsaiModel || !models.includes(bonsaiModel)) && models.length > 0)
          setBonsaiModel(models[0]);
      } else if (aiProvider === "bitnet") {
        const models = await bitnetListModels(bitnetUrl);
        setBitnetModels(models);
        if ((!bitnetModel || !models.includes(bitnetModel)) && models.length > 0)
          setBitnetModel(models[0]);
      } else {
        const models = await ollamaListModels(ollamaUrl);
        setOllamaModels(models);
        const preferred = pickPreferredOllamaModel(models);
        const currentStillValid =
          ollamaModel && models.includes(ollamaModel) && !isOcrOrNonChatModel(ollamaModel);
        if (!currentStillValid && preferred) setOllamaModel(preferred);
      }
    } catch {
      if (aiProvider === "lmstudio") setLmStudioModels([]);
      else if (aiProvider === "bonsai") setBonsaiModels([]);
      else if (aiProvider === "bitnet") setBitnetModels([]);
      else setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [aiProvider, ollamaUrl, lmStudioUrl, bonsaiUrl, bitnetUrl, ollamaModel, lmStudioModel, bonsaiModel, bitnetModel]);

  const testGlmocr = useCallback(async () => {
    setTestingGlmocr(true);
    try {
      const status = await getGlmocrStatus(ollamaUrl);
      setGlmocrDetails(status);
      setGlmocrStatus(status.available);
    } catch {
      setGlmocrDetails(null);
      setGlmocrStatus(false);
    } finally {
      setTestingGlmocr(false);
    }
  }, [ollamaUrl]);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);
  useEffect(() => {
    if (aiProvider === "ollama") void testGlmocr();
  }, [aiProvider, testGlmocr]);

  const initFromSettings = useCallback(
    (s: {
      ai_provider?: string;
      ollama_url?: string;
      ollama_model?: string;
      lm_studio_url?: string;
      lm_studio_model?: string;
      bonsai_url?: string;
      bonsai_model?: string;
      bitnet_url?: string;
      bitnet_model?: string;
    }) => {
      if (s.ai_provider) setAiProvider(s.ai_provider as AiProvider);
      if (s.ollama_url) setOllamaUrl(s.ollama_url);
      if (s.ollama_model !== undefined) setOllamaModel(s.ollama_model);
      if (s.lm_studio_url) setLmStudioUrl(s.lm_studio_url);
      if (s.lm_studio_model !== undefined) setLmStudioModel(s.lm_studio_model);
      if (s.bonsai_url) setBonsaiUrl(s.bonsai_url);
      if (s.bonsai_model !== undefined) setBonsaiModel(s.bonsai_model);
      if (s.bitnet_url) setBitnetUrl(s.bitnet_url);
      if (s.bitnet_model !== undefined) setBitnetModel(s.bitnet_model);
    },
    [],
  );

  const currentModels =
    aiProvider === "lmstudio"
      ? lmStudioModels
      : aiProvider === "bonsai"
        ? bonsaiModels
        : aiProvider === "bitnet"
          ? bitnetModels
          : ollamaModels.filter((m) => !isOcrOrNonChatModel(m));
  const currentModel = aiProvider === "lmstudio"
    ? lmStudioModel
    : aiProvider === "bonsai"
      ? bonsaiModel
      : aiProvider === "bitnet"
        ? bitnetModel
        : ollamaModel;
  const currentUrl = aiProvider === "lmstudio"
    ? lmStudioUrl
    : aiProvider === "bonsai"
      ? bonsaiUrl
      : aiProvider === "bitnet"
        ? bitnetUrl
        : ollamaUrl;
  const setCurrentUrl = aiProvider === "lmstudio"
    ? setLmStudioUrl
    : aiProvider === "bonsai"
      ? setBonsaiUrl
      : aiProvider === "bitnet"
        ? setBitnetUrl
        : setOllamaUrl;
  const setCurrentModel = aiProvider === "lmstudio"
    ? setLmStudioModel
    : aiProvider === "bonsai"
      ? setBonsaiModel
      : aiProvider === "bitnet"
        ? setBitnetModel
        : setOllamaModel;
  const defaultUrl = aiProvider === "lmstudio"
    ? "http://localhost:1234"
    : aiProvider === "bonsai"
      ? "http://localhost:8080"
      : aiProvider === "bitnet"
        ? "http://localhost:8090"
        : "http://localhost:11434";
  const defaultModel = aiProvider === "lmstudio"
    ? ""
    : aiProvider === "bonsai"
      ? ""
      : aiProvider === "bitnet"
        ? ""
        : pickPreferredOllamaModel(currentModels);
  const providerLabel = aiProvider === "lmstudio"
    ? "LM Studio"
    : aiProvider === "bonsai"
      ? "Bonsai"
      : aiProvider === "bitnet"
        ? "BitNet"
        : "Ollama";

  return {
    aiProvider,
    ollamaUrl,
    ollamaModel,
    lmStudioUrl,
    lmStudioModel,
    bonsaiUrl,
    bonsaiModel,
    bitnetUrl,
    bitnetModel,
    providerStatus,
    glmocrStatus,
    glmocrDetails,
    testingProvider,
    testingGlmocr,
    loadingModels,
    currentModels,
    currentModel,
    currentUrl,
    defaultUrl,
    defaultModel,
    providerLabel,
    setAiProvider,
    setCurrentUrl,
    setCurrentModel,
    setProviderStatus,
    testProvider,
    fetchModels,
    testGlmocr,
    initFromSettings,
  };
}
