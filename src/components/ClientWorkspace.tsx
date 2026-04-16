import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  Receipt,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { AccountManagementPage } from "../features/accounts/AccountManagementPage";
import { ClientEditModal } from "../features/clients/ClientEditModal";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { BalanceSheetView } from "../features/reports/BalanceSheetView";
import { CashFlowView } from "../features/reports/CashFlowView";
import { PnLView } from "../features/reports/PnLView";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { useI18n } from "../lib/i18n";
import { triggerPrint } from "../lib/print-utils";
import type { Client } from "../lib/tauri";
import { cn, formatDate, PERIOD_LABELS, periodRange, type ReportPeriod } from "../lib/utils";

const AiWorkspace = lazy(() =>
  import("../features/ai/AiWorkspace").then((m) => ({ default: m.AiWorkspace })),
);

type WorkspaceTab = "overview" | "transactions" | "invoices" | "documents" | "reports" | "ai";

const PERIODS: ReportPeriod[] = ["annual", "h1", "h2", "q1", "q2", "q3", "q4"];

const MIN_YEAR = 2000;

interface ClientWorkspaceProps {
  client: Client;
}

export function ClientWorkspace({ client }: ClientWorkspaceProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [reportType, setReportType] = useState<"pnl" | "balance_sheet" | "cash_flow">("pnl");
  const [period, setPeriod] = useState<ReportPeriod>("annual");
  const [editingClient, setEditingClient] = useState(false);

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [taxYear, setTaxYear] = useState(currentYear);
  const isRecent = recentYears.includes(taxYear);

  const { from, to } = useMemo(() => periodRange(taxYear, period), [taxYear, period]);

  const WORKSPACE_TABS: { id: WorkspaceTab; label: string; icon?: React.ReactNode }[] = [
    { id: "overview", label: t("Overview") },
    { id: "transactions", label: t("Transactions"), icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "invoices", label: t("Invoices"), icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "documents", label: t("Documents") },
    { id: "reports", label: t("Reports"), icon: <Printer className="w-3.5 h-3.5" /> },
    { id: "ai", label: t("ai.workspaceTitle"), icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const ENTITY_LABELS: Record<Client["entity_type"], string> = {
    sole_prop: t("Sole Proprietor"),
    smllc: t("SMLLC"),
    scorp: t("S-Corp"),
    ccorp: t("C-Corp"),
    partnership: t("Partnership"),
  };

  const isReportTab = tab === "reports";

  return (
    <div className="flex flex-col h-full">
      {tab !== "overview" && (
        <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900 truncate">{client.name}</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
              {ENTITY_LABELS[client.entity_type]}
            </span>
            {client.ein && (
              <span className="text-xs text-gray-500 shrink-0">
                {t("EIN")}: {client.ein}
              </span>
            )}
            <span className="ml-auto text-xs text-gray-400 capitalize shrink-0">
              {client.accounting_method} {t("basis")}
            </span>
          </div>
        </div>
      )}

      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-4 flex-wrap print:hidden">
        <nav className="flex gap-1">
          {WORKSPACE_TABS.map((wt) => (
            <button
              key={wt.id}
              onClick={() => setTab(wt.id)}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5",
                tab === wt.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {wt.icon}
              {wt.label}
            </button>
          ))}
        </nav>

        {isReportTab && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setTaxYear((y) => Math.max(MIN_YEAR, y - 1))}
              disabled={taxYear <= MIN_YEAR}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {recentYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setTaxYear(y)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    taxYear === y
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTaxYear((y) => Math.min(currentYear, y + 1))}
              disabled={taxYear >= currentYear}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {!isRecent && (
              <span className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                {taxYear}
              </span>
            )}
            <span className="text-xs text-gray-400 tabular-nums ml-1">
              {from} &mdash; {to}
            </span>
            <button
              onClick={triggerPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors ml-1"
            >
              <Printer className="w-4 h-4" />
              {t("Print")}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
        {tab === "overview" && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-5">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{client.name}</h2>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {ENTITY_LABELS[client.entity_type]}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {client.accounting_method} {t("basis")}
                        </span>
                        {client.ein && (
                          <span className="text-xs text-gray-500">
                            {t("EIN")}: {client.ein}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingClient(true)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {t("Edit Profile")}
                    </button>
                  </div>
                  <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {t("Created")}: {formatDate(client.created_at)}
                    </span>
                    {client.fiscal_year_start_month > 1 && (
                      <span>
                        {t("Fiscal Year Start")}: {client.fiscal_year_start_month}/1
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">{t("Business Profile")}</h3>
                  <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                    <span className="text-gray-500">{t("Contact Name")}</span>
                    <span className="text-gray-900">{client.contact_name || "—"}</span>
                    <span className="text-gray-500">{t("Email")}</span>
                    <span className="text-gray-900">{client.email || "—"}</span>
                    <span className="text-gray-500">{t("Phone")}</span>
                    <span className="text-gray-900">{client.phone || "—"}</span>
                    <span className="text-gray-500">{t("Website")}</span>
                    <span className="text-gray-900 break-all">{client.website || "—"}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">{t("Address")}</h3>
                  <div className="text-sm text-gray-900 leading-6">
                    {client.address_line1 ||
                    client.address_line2 ||
                    client.city ||
                    client.state ||
                    client.postal_code ||
                    client.country ? (
                      <>
                        {client.address_line1 && <div>{client.address_line1}</div>}
                        {client.address_line2 && <div>{client.address_line2}</div>}
                        {(client.city || client.state || client.postal_code) && (
                          <div>
                            {[client.city, client.state, client.postal_code]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        )}
                        {client.country && <div>{client.country}</div>}
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              </div>
              {(client.tax_preparer_notes || client.filing_notes) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 pt-5 border-t border-gray-100">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      {t("Tax Preparer Notes")}
                    </h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {client.tax_preparer_notes || "—"}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      {t("Filing Notes")}
                    </h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {client.filing_notes || "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <AccountManagementPage compact />
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <InvoicesPage compact />
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <DocumentsPage compact />
            </div>
          </div>
        )}
        {tab === "transactions" && <TransactionsPage />}
        {tab === "invoices" && <InvoicesPage />}
        {tab === "documents" && <DocumentsPage />}
        {tab === "reports" && (
          <div className="flex flex-col h-full">
            {/* Report type + period selector */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 dark:border-neutral-700 px-5 py-2.5 print:hidden shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Report type tabs */}
                <div className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-0.5">
                  {(["pnl", "balance_sheet", "cash_flow"] as const).map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReportType(rt)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        reportType === rt
                          ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 shadow-sm"
                          : "text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-300",
                      )}
                    >
                      {rt === "pnl"
                        ? t("Profit & Loss")
                        : rt === "balance_sheet"
                          ? t("Balance Sheet")
                          : t("Cash Flow")}
                    </button>
                  ))}
                </div>

                {/* Period selector */}
                <div className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                        period === p
                          ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 shadow-sm"
                          : "text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-300",
                      )}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>

                <button
                  onClick={triggerPrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors ml-auto"
                >
                  <Printer className="w-4 h-4" />
                  {t("Print")}
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-50 print:bg-white min-h-full py-6 print:py-0 overflow-auto">
              {reportType === "pnl" && (
                <PnLView dateFrom={from} dateTo={to} clientName={client.name} />
              )}
              {reportType === "balance_sheet" && (
                <BalanceSheetView asOfDate={to} clientName={client.name} />
              )}
              {reportType === "cash_flow" && (
                <CashFlowView dateFrom={from} dateTo={to} clientName={client.name} />
              )}
            </div>
          </div>
        )}
        {tab === "ai" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            }
          >
            <AiWorkspace clientId={client.id} />
          </Suspense>
        )}
      </div>
      {editingClient && (
        <ClientEditModal
          client={client}
          onClose={() => setEditingClient(false)}
          onSaved={() => setEditingClient(false)}
        />
      )}
    </div>
  );
}
