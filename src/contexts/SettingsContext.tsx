import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
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
    glmocr_path: "",
    theme: "system",
    default_export_path: "",
    app_pin: "",
    ocr_auto_post_threshold: 0.7,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadSettings = async () => {
    try {
      const loaded = await getSettings();
      setSettings(loaded);
      setSettingsLoaded(true);
    } catch (error) {
      console.error("Failed to load settings:", error);
      // Keep defaults and mark as loaded so app can still function
      setSettingsLoaded(true);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const refreshSettings = async () => {
    await loadSettings();
  };

  const value: SettingsContextValue = {
    ...settings,
    settingsLoaded,
    refreshSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
