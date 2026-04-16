import { invoke } from "@tauri-apps/api/core";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringTransaction {
  id: string;
  client_id: string;
  description: string;
  amount_cents: number;
  debit_account_id: string;
  credit_account_id: string;
  frequency: RecurringFrequency;
  start_date: string;
  next_run_date: string;
  end_date?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringPayload {
  description: string;
  amount_cents: number;
  debit_account_id: string;
  credit_account_id: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string;
}

export interface UpdateRecurringPatch {
  description?: string;
  amount_cents?: number;
  debit_account_id?: string;
  credit_account_id?: string;
  frequency?: RecurringFrequency;
  end_date?: string;
  active?: boolean;
}

export interface RunDueResult {
  created: number;
}

export const listRecurring = (): Promise<RecurringTransaction[]> => invoke("list_recurring");

export const createRecurring = (payload: CreateRecurringPayload): Promise<RecurringTransaction> =>
  invoke("create_recurring", { payload });

export const updateRecurring = (
  id: string,
  patch: UpdateRecurringPatch,
): Promise<RecurringTransaction> => invoke("update_recurring", { id, patch });

export const deleteRecurring = (id: string): Promise<void> =>
  invoke("delete_recurring", { id });

export const runDueRecurring = (): Promise<RunDueResult> => invoke("run_due_recurring");
