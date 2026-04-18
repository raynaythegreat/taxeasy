import { invoke } from "./tauri";

export interface MileageLog {
  id: string;
  client_id: string;
  date: string;
  purpose: string;
  origin: string;
  destination: string;
  miles_real: number;
  rate_cents: number;
  deduction_cents: number;
  notes?: string;
  receipt_image_path?: string;
  created_at: string;
}

export interface MileageRate {
  year: number;
  rate_cents: number;
  effective_date: string;
  notes?: string;
}

export interface CreateMileagePayload {
  date: string;
  purpose: string;
  origin: string;
  destination: string;
  miles_real: number;
  notes?: string;
}

export async function createMileageLog(payload: CreateMileagePayload): Promise<MileageLog> {
  return invoke("create_mileage_log", { payload });
}

export async function listMileageLogs(clientId: string, year: number): Promise<MileageLog[]> {
  return invoke("list_mileage_logs", { clientId, year });
}

export async function deleteMileageLog(logId: string): Promise<void> {
  return invoke("delete_mileage_log", { logId });
}

export async function getIrsMileageRate(year: number): Promise<MileageRate> {
  return invoke("get_irs_mileage_rate", { year });
}

export async function getMileageDeductionTotal(clientId: string, year: number): Promise<number> {
  return invoke("get_mileage_deduction_total", { clientId, year });
}
