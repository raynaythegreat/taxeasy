import { invoke } from "@tauri-apps/api/core";

export interface DashboardStats {
  total_clients: number;
  active_clients: number;
  ytd_revenue: string;
  ytd_expenses: string;
  ytd_net_income: string;
  total_transactions: number;
  recent_transactions: Array<{
    id: string;
    txn_date: string;
    description: string;
    total_debit: string;
  }>;
  account_balances: Array<{
    account_type: string;
    balance: string;
  }>;
}

export interface NetCashPoint {
  bucket: string;
  net_cents: number;
}

export interface CategoryTotal {
  account_id: string;
  account_name: string;
  total_cents: number;
  percentage: string;
}

export interface DeductibleSummary {
  total_cents: number;
  total: string;
}

export type TrendBucket = "daily" | "weekly" | "monthly";

/** Get dashboard stats for a half-open [start, end) range. Omit range for fiscal YTD. */
export async function getDashboardStats(
  range?: {
    start: string;
    end: string;
  },
  clientId?: string,
): Promise<DashboardStats> {
  return invoke("get_dashboard_stats", {
    start: range?.start ?? null,
    end: range?.end ?? null,
    clientId: clientId ?? null,
  });
}

/** Net cash over time, bucketed by day/week/month within [start, end). */
export async function getNetCashTrend(
  start: string,
  end: string,
  bucket: TrendBucket,
  clientId?: string,
): Promise<NetCashPoint[]> {
  return invoke("get_net_cash_trend", { start, end, bucket, clientId: clientId ?? null });
}

/** Top N expense categories by spend within [start, end). */
export async function getTopCategories(
  start: string,
  end: string,
  n?: number,
  clientId?: string,
): Promise<CategoryTotal[]> {
  return invoke("get_top_categories", { start, end, n: n ?? null, clientId: clientId ?? null });
}

/** Sum of deductible-tagged expenses within [start, end). */
export async function getDeductibleExpenses(
  start: string,
  end: string,
  clientId?: string,
): Promise<DeductibleSummary> {
  return invoke("get_deductible_expenses", { start, end, clientId: clientId ?? null });
}
