import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  ai_provider: string;
  ollama_url: string;
  ollama_model: string;
  lm_studio_url: string;
  lm_studio_model: string;
  glmocr_path: string;
  theme: string;
  default_export_path: string;
}

export interface SaveSettingsPayload {
  ai_provider?: string;
  ollama_url?: string;
  ollama_model?: string;
  lm_studio_url?: string;
  lm_studio_model?: string;
  glmocr_path?: string;
  theme?: string;
  default_export_path?: string;
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(payload: SaveSettingsPayload): Promise<void> {
  return invoke("save_settings", { payload });
}

export async function ollamaHealth(): Promise<boolean> {
  return invoke("ollama_health");
}

export async function ollamaHealthUrl(url: string): Promise<boolean> {
  return invoke("ollama_health_url", { url });
}

export async function ollamaListModels(url: string): Promise<string[]> {
  return invoke("ollama_list_models", { url });
}

export async function lmstudioHealth(url: string): Promise<boolean> {
  return invoke("lmstudio_health", { url });
}

export async function lmstudioListModels(url: string): Promise<string[]> {
  return invoke("lmstudio_list_models", { url });
}

export async function glmocrCheckAvailable(): Promise<boolean> {
  return invoke("glmocr_available");
}
