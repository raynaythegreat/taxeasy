import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  ollama_url: string;
  ollama_model: string;
  glmocr_path: string;
  theme: string;
  default_export_path: string;
}

export interface SaveSettingsPayload {
  ollama_url?: string;
  ollama_model?: string;
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

export async function glmocrCheckAvailable(): Promise<boolean> {
  return invoke("glmocr_available");
}
