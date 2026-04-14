import { invoke } from "@tauri-apps/api/core";

export interface CreateAccountPayload {
  code: string;
  name: string;
  account_type: string;
  parent_id?: string;
  schedule_c_line?: string;
}

export interface UpdateAccountPayload {
  name?: string;
  code?: string;
  schedule_c_line?: string;
}

export async function createAccount(payload: CreateAccountPayload) {
  return invoke("create_account", { payload });
}

export async function updateAccount(id: string, payload: UpdateAccountPayload) {
  return invoke("update_account", { id, payload });
}

export async function toggleAccountActive(id: string, active: boolean) {
  return invoke("toggle_account_active", { id, active });
}
