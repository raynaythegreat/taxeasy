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

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke("get_dashboard_stats");
}
