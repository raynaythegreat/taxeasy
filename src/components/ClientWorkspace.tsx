import { useState } from "react";
import { Printer } from "lucide-react";
import type { Client } from "../lib/tauri";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { AccountManagementPage } from "../features/accounts/AccountManagementPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { PnLView } from "../features/reports/PnLView";
import { BalanceSheetView } from "../features/reports/BalanceSheetView";
import { CashFlowView } from "../features/reports/CashFlowView";
import { cn, today, fiscalYearRange } from "../lib/utils";

type WorkspaceTab = "transactions" | "accounts" | "invoices" | "pnl" | "balance_sheet" | "cash_flow";

const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "invoices", label: "Invoices" },
  { id: "pnl", label: "Profit & Loss" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow", label: "Cash Flow" },
];

const ENTITY_LABELS: Record<Client["entity_type"], string> = {
  sole_prop: "Sole Proprietor",
  smllc: "SMLLC",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
};

const _year = new Date().getFullYear();
const _defaultRange = fiscalYearRange(_year);

interface ClientWorkspaceProps {
  client: Client;
}

export function ClientWorkspace({ client }: ClientWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>("transactions");
  const [dateFrom, setDateFrom] = useState(_defaultRange.from);
  const [dateTo, setDateTo] = useState(_defaultRange.to);
  const [asOfDate, setAsOfDate] = useState(today());

  const isReportTab = tab !== "transactions" && tab !== "accounts" && tab !== "invoices";

  return (
    <div className="flex flex-col h-full">
      {/* Client header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900 truncate">{client.name}</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
            {ENTITY_LABELS[client.entity_type]}
          </span>
          {client.ein && (
            <span className="text-xs text-gray-500 shrink-0">EIN: {client.ein}</span>
          )}
          <span className="ml-auto text-xs text-gray-400 capitalize shrink-0">
            {client.accounting_method} basis
          </span>
        </div>
      </div>

      {/* Sub-tab toolbar */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-4 flex-wrap print:hidden">
        <nav className="flex gap-1">
          {WORKSPACE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Date controls — report tabs only */}
        {isReportTab && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {tab === "balance_sheet" ? (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
                  As of
                </label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
                  From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
                  To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
        {tab === "transactions" && <TransactionsPage />}
        {tab === "accounts" && <AccountManagementPage />}
        {tab === "invoices" && <InvoicesPage />}
        {tab === "pnl" && (
          <div className="bg-gray-50 print:bg-white min-h-full py-6 print:py-0">
            <PnLView dateFrom={dateFrom} dateTo={dateTo} clientName={client.name} />
          </div>
        )}
        {tab === "balance_sheet" && (
          <div className="bg-gray-50 print:bg-white min-h-full py-6 print:py-0">
            <BalanceSheetView asOfDate={asOfDate} clientName={client.name} />
          </div>
        )}
        {tab === "cash_flow" && (
          <div className="bg-gray-50 print:bg-white min-h-full py-6 print:py-0">
            <CashFlowView dateFrom={dateFrom} dateTo={dateTo} clientName={client.name} />
          </div>
        )}
      </div>
    </div>
  );
}
