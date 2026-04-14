import { invoke } from "@tauri-apps/api/core";

export interface UpdateClientPayload {
  name?: string;
  entity_type?: string;
  ein?: string;
  fiscal_year_start_month?: number;
  accounting_method?: string;
}

export async function updateClient(id: string, payload: UpdateClientPayload) {
  return invoke("update_client", { id, payload });
}

export async function archiveClient(id: string) {
  return invoke("archive_client", { id });
}
