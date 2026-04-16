import { invoke } from "@tauri-apps/api/core";

/**
 * Append a structured error entry to ${app_log_dir}/errors.log.
 * Failures are swallowed — this is last-resort telemetry.
 */
export async function logError(message: string, stack?: string): Promise<void> {
  try {
    await invoke("log_error", { message, stack });
  } catch {
    // Intentionally swallowed: we cannot log the logger failing
  }
}

/**
 * Returns the absolute path to the errors.log file.
 * Used by the About tab "Export diagnostics" button.
 */
export async function getErrorLogPath(): Promise<string> {
  return invoke<string>("get_error_log_path");
}
