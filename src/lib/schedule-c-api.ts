import { invoke } from "./tauri";

export interface ScheduleCMapping {
  id: string;
  client_id: string;
  account_id: string;
  schedule_c_line: string;
  is_custom: boolean;
  created_at: string;
  account_name: string;
  account_type: string;
}

export interface ScheduleCSummary {
  tax_year: number;
  gross_receipts: number;
  returns_and_allowances: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  other_income: number;
  gross_income: number;
  expenses_by_line: Record<string, number>;
  total_expenses: number;
  tentative_profit: number;
}

export interface UpsertMappingPayload {
  account_id: string;
  schedule_c_line: string;
}

export async function listScheduleCMappings(): Promise<ScheduleCMapping[]> {
  return invoke("list_schedule_c_mappings");
}

export async function upsertScheduleCMapping(payload: UpsertMappingPayload): Promise<ScheduleCMapping> {
  return invoke("upsert_schedule_c_mapping", payload);
}

export async function deleteScheduleCMapping(mappingId: string): Promise<void> {
  return invoke("delete_schedule_c_mapping", { mappingId });
}

export async function calculateScheduleCSummary(year: number): Promise<ScheduleCSummary> {
  return invoke("calculate_schedule_c_summary", { year });
}
