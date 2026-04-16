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
  app_pin: string;
  /** Minimum OCR confidence (0–1) required before a draft can be auto-posted. Default 0.7. */
  ocr_auto_post_threshold: number;
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
  app_pin?: string;
  ocr_auto_post_threshold?: number;
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

export interface GlmOcrStatus {
  available: boolean;
  model_name: string | null;
  message: string;
}

export async function glmocrCheckAvailable(url?: string): Promise<boolean> {
  return invoke("glmocr_available", { url: url ?? null });
}

export async function getGlmocrStatus(url?: string): Promise<GlmOcrStatus> {
  return invoke("glmocr_status", { url: url ?? null });
}
