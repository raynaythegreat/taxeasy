import { invoke } from "@tauri-apps/api/core";

export async function backupDatabase(): Promise<string> {
  return invoke("backup_database");
}

export async function restoreDatabase(): Promise<string> {
  return invoke("restore_database");
}
