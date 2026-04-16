import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// ── Domain types ──────────────────────────────────────────────────────────────

export type EntityType = "sole_prop" | "smllc" | "scorp" | "ccorp" | "partnership";
export type AccountingMethod = "cash" | "accrual";
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface Client {
  id: string;
  name: string;
  entity_type: EntityType;
  ein?: string;
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
  fiscal_year_start_month: number;
  accounting_method: AccountingMethod;
  archived_at?: string;
  created_at: string;
}

export interface CreateClientPayload {
  name: string;
  entity_type: EntityType;
  ein?: string;
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
  accounting_method?: AccountingMethod;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id?: string;
  schedule_c_line?: string;
  active: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  reference?: string;
  locked: boolean;
  created_at: string;
}

export interface Entry {
  id: string;
  transaction_id: string;
  account_id: string;
  account_name?: string;
  debit: string;
  credit: string;
  memo?: string;
  account_type?: string;
}

export interface TransactionWithEntries extends Transaction {
  entries: Entry[];
}

export interface CreateTransactionPayload {
  txn_date: string;
  description: string;
  reference?: string;
  entries: EntryPayload[];
}

export interface EntryPayload {
  account_id: string;
  debit?: string;
  credit?: string;
  memo?: string;
}

// Reports
export interface PnlLineItem {
  account_id: string;
  code: string;
  name: string;
  schedule_c_line?: string;
  amount: string;
}

export interface PnlReport {
  date_from: string;
  date_to: string;
  revenue_lines: PnlLineItem[];
  cogs_lines: PnlLineItem[];
  expense_lines: PnlLineItem[];
  total_revenue: string;
  total_cogs: string;
  gross_profit: string;
  total_expenses: string;
  net_income: string;
}

// BalanceSheetLineItem is exported for use in views
export interface BalanceSheetLineItem {
  account_id: string;
  code: string;
  name: string;
  balance: string;
}

export interface BalanceSheetReport {
  as_of_date: string;
  asset_lines: BalanceSheetLineItem[];
  liability_lines: BalanceSheetLineItem[];
  equity_lines: BalanceSheetLineItem[];
  total_assets: string;
  total_liabilities: string;
  total_equity: string;
  total_liabilities_and_equity: string;
  net_income_ytd: string;
  is_balanced: boolean;
}

export interface CashFlowLineItem {
  label: string;
  amount: string;
}

export interface CashFlowReport {
  date_from: string;
  date_to: string;
  net_income: string;
  operating_adjustments: CashFlowLineItem[];
  net_cash_from_operations: string;
  investing_activities: CashFlowLineItem[];
  net_cash_from_investing: string;
  financing_activities: CashFlowLineItem[];
  net_cash_from_financing: string;
  net_change_in_cash: string;
  beginning_cash: string;
  ending_cash: string;
}

// ── IPC wrappers ──────────────────────────────────────────────────────────────

// Auth
export const unlock = (passphrase: string): Promise<boolean> =>
  invoke("unlock_app", { passphrase });

// Clients
export const listClients = (): Promise<Client[]> => invoke("list_clients");

export const createClient = (payload: CreateClientPayload): Promise<Client> =>
  invoke("create_client", { payload });

export const switchClient = (clientId: string): Promise<void> =>
  invoke("switch_client", { clientId });

export const getActiveClientId = (): Promise<string | null> => invoke("get_active_client_id");

// Accounts
export const listAccounts = (): Promise<Account[]> => invoke("list_accounts");

export const getAccountBalance = (accountId: string, asOfDate: string): Promise<string> =>
  invoke("get_account_balance", { accountId, asOfDate });

// Transactions
export const listTransactions = (params?: {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
}): Promise<TransactionWithEntries[]> =>
  invoke("list_transactions", {
    dateFrom: params?.dateFrom ?? null,
    dateTo: params?.dateTo ?? null,
    accountId: params?.accountId ?? null,
  });

export const createTransaction = (
  payload: CreateTransactionPayload,
): Promise<TransactionWithEntries> => invoke("create_transaction", { payload });

export interface UpdateTransactionPayload {
  txnId: string;
  txnDate: string;
  description: string;
  reference?: string;
  entries?: EntryPayload[];
}

export const updateTransaction = (payload: UpdateTransactionPayload): Promise<void> =>
  invoke("update_transaction", { ...payload });

export const deleteTransaction = (txnId: string): Promise<void> =>
  invoke("delete_transaction", { txnId });

// Reports
export const getPnl = (dateFrom: string, dateTo: string): Promise<PnlReport> =>
  invoke("get_pnl", { dateFrom, dateTo });

/** Period-scoped balance sheet for a half-open [start, end) range. */
export const getBalanceSheet = (start: string, end: string): Promise<BalanceSheetReport> =>
  invoke("get_balance_sheet", { start, end });

/** Cumulative balance sheet: sums all posted transactions with txn_date <= asOfDate.
 *  Traditional "as of year-end" semantics — every balance ever accumulated shows up. */
export const getBalanceSheetCumulative = (asOfDate: string): Promise<BalanceSheetReport> =>
  invoke("get_balance_sheet_cumulative", { asOfDate });

export const getCashFlow = (dateFrom: string, dateTo: string): Promise<CashFlowReport> =>
  invoke("get_cash_flow", { dateFrom, dateTo });

export const setActiveClientPref = (clientId: string): Promise<void> =>
  invoke("set_active_client_pref", { clientId });

export const getActiveClientPref = (): Promise<string | null> => invoke("get_active_client_pref");

export interface ExtractedReceipt {
  vendor: string | null;
  date: string | null;
  total: string | null;
  line_items: { description: string; amount: string | null }[];
  raw_text: string;
}

export interface CategorizeSuggestion {
  account_id: string;
  account_name: string;
  confidence: number;
  reason: string;
}

export const glmocrAvailable = (): Promise<boolean> => invoke("glmocr_available");

export const scanReceipt = (filePath: string): Promise<ExtractedReceipt> =>
  invoke("scan_receipt", { filePath });

export const suggestCategory = (
  description: string,
  amountStr: string,
): Promise<CategorizeSuggestion> => invoke("suggest_category", { description, amountStr });

const FILE_FILTERS = [
  {
    name: "Documents & Images",
    extensions: [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "heic",
      "heif",
      "tiff",
      "tif",
      "bmp",
      "gif",
      "pdf",
      "csv",
      "txt",
    ],
  },
];

export const pickReceiptFile = (): Promise<string | null> =>
  openDialog({ multiple: false, filters: FILE_FILTERS }) as Promise<string | null>;

export const pickReceiptFiles = (): Promise<string[] | null> =>
  openDialog({ multiple: true, filters: FILE_FILTERS }) as Promise<string[] | null>;

export const listDirFiles = (path: string): Promise<string[]> => invoke("list_dir_files", { path });

// ── B4: Period range — single source of truth ─────────────────────────────────

/** Half-open date range [start, end) as returned by report_period_for. */
export interface PeriodRange {
  start: string;
  end: string;
}

/**
 * Period types understood by report_period_for.
 * All types except "custom" are computed server-side using the client's
 * fiscal_year_start_month so frontend and backend always agree.
 */
export type PeriodTypeInput =
  | { type: "this_year" }
  | { type: "ytd" }
  | { type: "tax_year" }
  | { type: "last_tax_year" }
  | { type: "quarter" }
  | { type: "this_month" }
  | { type: "last_month" }
  | { type: "custom"; start: string; end: string };

/**
 * Compute a half-open [start, end) period range on the backend.
 * Pass today's ISO date as anchorDate so relative periods are stable.
 *
 * @example
 *   const { start, end } = await reportPeriodFor(clientId, { type: "tax_year" }, today());
 *   const report = await getPnl(start, end);
 */
export const reportPeriodFor = (
  clientId: string,
  periodType: PeriodTypeInput,
  anchorDate: string,
): Promise<PeriodRange> => invoke("report_period_for", { clientId, periodType, anchorDate });

// ─── Tax News ────────────────────────────────────────────────────────────────

export type { NewsItem } from "./tax-news-api";

export const fetchTaxNews = (clientId?: string): Promise<import("./tax-news-api").NewsItem[]> =>
  invoke("fetch_tax_news", { clientId: clientId ?? null });

export const refreshTaxNews = (clientId?: string): Promise<import("./tax-news-api").NewsItem[]> =>
  invoke("refresh_tax_news", { clientId: clientId ?? null });
