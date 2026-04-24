import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type AppSettings, getSettings } from "../lib/settings-api";

interface SettingsContextValue extends AppSettings {
  settingsLoaded: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({
    ai_provider: "ollama",
    ollama_url: "http://localhost:11434",
    ollama_model: "",
    lm_studio_url: "http://localhost:1234",
    lm_studio_model: "",
    bonsai_url: "http://localhost:8080",
    bonsai_model: "",
    bitnet_url: "http://localhost:8090",
    bitnet_model: "",
    govinfo_api_key: "",
    glmocr_path: "",
    ocr_engine: "auto",
    theme: "system",
    default_export_path: "",
    app_pin: "",
    ocr_auto_post_threshold: 0.7,
    ocr_vision_verification: true,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const loaded = await getSettings();
      setSettings(loaded);
      setSettingsLoaded(true);
    } catch (error) {
      console.error("Failed to load settings:", error);
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  const value: SettingsContextValue = useMemo(
    () => ({
      ...settings,
      settingsLoaded,
      refreshSettings,
    }),
    [settings, settingsLoaded, refreshSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
