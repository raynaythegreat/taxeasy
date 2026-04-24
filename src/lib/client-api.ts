import { invoke } from "@tauri-apps/api/core";

export interface UpdateClientPayload {
  name?: string;
  entity_type?: string;
  ein?: string;
  source_folder_path?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  website?: string;
  tax_preparer_notes?: string;
  filing_notes?: string;
  fiscal_year_start_month?: number;
  accounting_method?: string;
}

export async function updateClient(id: string, payload: UpdateClientPayload) {
  return invoke("update_client", { id, payload });
}

export async function archiveClient(id: string) {
  return invoke("archive_client", { id });
}
