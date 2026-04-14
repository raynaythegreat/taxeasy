import { invoke } from "@tauri-apps/api/core";

export async function searchTransactions(params: {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  search?: string;
}) {
  return invoke("list_transactions", params);
}
