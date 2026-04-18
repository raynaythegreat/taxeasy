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

export interface IrsRate {
  year: number;
  rate_cents: number;
}

export interface MileageSummary {
  year: number;
  total_miles: number;
  total_deduction_cents: number;
  log_count: number;
}

export interface CreateMileagePayload {
  client_id: string;
  date: string;
  purpose: string;
  origin: string;
  destination: string;
  miles_real: number;
  notes?: string;
  receipt_image_path?: string;
  [key: string]: string | number | undefined;
}

export interface UpdateMileagePayload {
  date?: string;
  purpose?: string;
  origin?: string;
  destination?: string;
  miles_real?: number;
  notes?: string;
  receipt_image_path?: string;
  [key: string]: string | number | undefined;
}

export async function createMileageLog(
  payload: CreateMileagePayload,
): Promise<MileageLog> {
  return invoke("create_mileage_log", payload);
}

export async function listMileageLogs(
  year: number,
): Promise<MileageLog[]> {
  return invoke("list_mileage_logs", { year });
}

export async function updateMileageLog(
  mileageLogId: string,
  payload: UpdateMileagePayload,
): Promise<MileageLog> {
  return invoke("update_mileage_log", { mileageLogId, payload });
}

export async function deleteMileageLog(mileageLogId: string): Promise<void> {
  return invoke("delete_mileage_log", { mileageLogId });
}

export async function getIrsMileageRate(year: number): Promise<IrsRate> {
  return invoke("get_irs_mileage_rate", { year });
}

export async function getMileageDeductionTotal(year: number): Promise<number> {
  return invoke("get_mileage_deduction_total", { year });
}

export async function getMileageSummary(year: number): Promise<MileageSummary> {
  return invoke("get_mileage_summary", { year });
}
