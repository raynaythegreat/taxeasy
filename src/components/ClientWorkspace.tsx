import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GitCompareArrows,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AccountManagementPage } from "../features/accounts/AccountManagementPage";
import { ClientEditModal } from "../features/clients/ClientEditModal";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { MileagePage } from "../features/mileage/MileagePage";
import { type BalanceSheetMode, BalanceSheetView } from "../features/reports/BalanceSheetView";
import { CashFlowView } from "../features/reports/CashFlowView";
import { PnLView } from "../features/reports/PnLView";
import { YearOverYearView } from "../features/reports/YearOverYearView";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { lastDayOf } from "../lib/date-utils";
import { handleExportReport } from "../lib/export-api";
import { useI18n } from "../lib/i18n";
import { triggerPrint } from "../lib/print-utils";
import { useQueryClient } from "@tanstack/react-query";
import type { Client } from "../lib/tauri";
import {
  cn,
  formatDate,
  maskEin,
  PERIOD_LABELS,
  periodRange,
  type ReportPeriod,
} from "../lib/utils";
import { resyncClientFolder } from "../lib/tauri";

const AiWorkspace = lazy(() =>
  import("../features/ai/AiWorkspace").then((m) => ({ default: m.AiWorkspace })),
);
const DashboardAnalytics = lazy(() =>
  import("./dashboard/DashboardAnalytics").then((m) => ({ default: m.DashboardAnalytics })),
);

export type WorkspaceTab =
  | "overview"
  | "transactions"
  | "invoices"
  | "documents"
  | "reports"
  | "ai"
  | "mileage"
  | "schedule-c"
  | "vendors";

const PERIODS: ReportPeriod[] = ["annual", "h1", "h2", "q1", "q2", "q3", "q4"];

const MIN_YEAR = 2000;

interface ClientWorkspaceProps {
  client: Client;
  initialTab?: WorkspaceTab;
}

export function ClientWorkspace({ client, initialTab = "overview" }: ClientWorkspaceProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [prevClientId, setPrevClientId] = useState(client.id);
  const [reportType, setReportType] = useState<"pnl" | "balance_sheet" | "cash_flow">("pnl");
  const [balanceSheetMode, setBalanceSheetMode] = useState<BalanceSheetMode>("period");
  const [period, setPeriod] = useState<ReportPeriod>("annual");
  const [compareYears, setCompareYears] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    if (client.id !== prevClientId) {
      setTab(initialTab);
      setPrevClientId(client.id);
    }
  }, [client.id, initialTab, prevClientId]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [taxYear, setTaxYear] = useState(currentYear);
  const isRecent = recentYears.includes(taxYear);

  async function handleResync() {
    if (!client.id || !client.source_folder_path) return;
    setResyncing(true);
    try {
      await resyncClientFolder(client.id);
      // Optionally show a success toast or refresh data
      queryClient.invalidateQueries();
    } catch (err) {
      console.error("Resync failed:", err);
      alert(t("Failed to re-sync folder. See console for details."));
    } finally {
      setResyncing(false);
    }
  }

  const ALL_TABS: { id: WorkspaceTab; label: string; icon?: React.ReactNode }[] = [
    { id: "overview", label: t("Overview") },
    { id: "transactions", label: t("Transactions"), icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "invoices", label: t("Invoices"), icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "documents", label: t("Documents") },
    { id: "reports", label: t("Reports"), icon: <Printer className="w-3.5 h-3.5" /> },
    { id: "mileage", label: t("Mileage"), icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "ai", label: t("ai.workspaceTitle"), icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const is1040 = client.entity_type === "i1040";

  const WORKSPACE_TABS = is1040
    ? ALL_TABS.filter((t) => ["overview", "documents", "invoices", "ai"].includes(t.id))
    : ALL_TABS;

  const ENTITY_LABELS: Record<Client["entity_type"], string> = {
    sole_prop: t("Sole Proprietor"),
    smllc: t("SMLLC"),
    scorp: t("S-Corp"),
    ccorp: t("C-Corp"),
    partnership: t("Partnership"),
    i1040: t("1040 Individual"),
  };

  function maskSsn(ssn: string): string {
    if (ssn.length < 7) return ssn;
    return `***-**-${ssn.slice(-4)}`;
  }

  const { from, to: toHalfOpen } = useMemo(() => periodRange(taxYear, period), [taxYear, period]);
  const toInclusive = lastDayOf(toHalfOpen);
  const { from: priorFrom, to: priorTo } = useMemo(
    () => periodRange(taxYear - 1, period),
    [taxYear, period],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await handleExportReport(reportType, from, toHalfOpen, client.id);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {tab !== "overview" && (
        <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900 truncate">{client.name}</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
              {ENTITY_LABELS[client.entity_type]}
            </span>
            {client.ein && (
              <span className="text-xs text-gray-500 shrink-0">
                {client.entity_type === "i1040" ? t("SSN") : t("EIN")}: {maskEin(client.ein)}
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
              type="button"
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
      </div>

      <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
        {tab === "overview" && (
          <div className="flex flex-col h-full">
            {/* Profile header */}
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
                            {client.entity_type === "i1040" ? t("SSN") : t("EIN")}:{" "}
                            {client.entity_type === "i1040"
                              ? maskSsn(client.ein)
                              : maskEin(client.ein)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setEditingClient(true)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {t("Edit Profile")}
                      </button>
                      {client.source_folder_path && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                t(
                                  "Re-sync this client's folder? This will scan for new documents.",
                                ),
                              )
                            ) {
                              void handleResync();
                            }
                          }}
                          disabled={resyncing}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${resyncing ? "animate-spin" : ""}`} />
                          {t("Re-sync Folder")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {t("Created")}:{" "}
                      {new Date(client.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
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

            {/* Business profile / address */}
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {is1040 ? t("Client Name") : t("Business Profile")}
                  </h3>
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

            {is1040 ? (
              /* Simplified 1040 overview - no transaction charts */
              <div className="flex-1 px-6 py-4 space-y-6 bg-gray-50">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("Quick Actions")}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setTab("documents")}
                      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {t("Upload Documents")}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t("Upload tax documents, W-2s, 1099s, and other supporting files.")}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("invoices")}
                      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                        <Receipt className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {t("New Invoice")}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t("Create your first invoice or receipt.")}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("ai")}
                      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {t("Open AI Workspace")}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t("ai.chatPlaceholder")}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-200">
                  <DocumentsPage compact clientId={client.id} />
                </div>
                <div className="border-t border-gray-200">
                  <InvoicesPage compact clientId={client.id} />
                </div>
              </div>
            ) : (
              /* Business client overview - full dashboard */
              <>
                <div className="shrink-0 border-t border-gray-200 px-6 py-5">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                      </div>
                    }
                  >
                    <DashboardAnalytics
                      clientId={client.id}
                      showTotalClientsCard={false}
                      onOpenTransactions={() => setTab("transactions")}
                      onOpenReports={() => setTab("reports")}
                    />
                  </Suspense>
                </div>
                <div className="shrink-0 border-t border-gray-200">
                  <AccountManagementPage compact clientId={client.id} />
                </div>
                <div className="shrink-0 border-t border-gray-200">
                  <InvoicesPage compact clientId={client.id} />
                </div>
                <div className="shrink-0 border-t border-gray-200">
                  <DocumentsPage compact clientId={client.id} />
                </div>
              </>
            )}
          </div>
        )}
        {tab === "transactions" && <TransactionsPage clientId={client.id} />}
        {tab === "invoices" && <InvoicesPage clientId={client.id} />}
        {tab === "documents" && <DocumentsPage clientId={client.id} />}
        {tab === "reports" && (
          <div className="flex flex-col h-full">
            {/* Two-row sticky toolbar */}
            <div className="sticky top-0 z-10 shrink-0 backdrop-blur bg-[var(--color-surface)]/95 border-b border-[var(--color-border)] px-5 py-3 print:hidden shadow-sm">
              {/* Row 1: report-type segmented tabs + action buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-[var(--color-hover)] rounded-lg p-1 gap-0.5">
                  {(["pnl", "balance_sheet", "cash_flow"] as const).map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReportType(rt)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer",
                        "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                        reportType === rt
                          ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
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

                <div className="ml-auto flex items-center gap-2">
                  {reportType === "balance_sheet" && !compareYears && (
                    <div className="flex items-center bg-[var(--color-hover)] rounded-lg p-1 gap-0.5">
                      {(
                        [
                          ["period", t("Period activity")],
                          ["cumulative", t("As of year-end (cumulative)")],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setBalanceSheetMode(mode)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer",
                            "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                            balanceSheetMode === mode
                              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Compare to prior year toggle */}
                  {reportType !== "cash_flow" && (
                    <button
                      type="button"
                      onClick={() => setCompareYears((v) => !v)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                        "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                        compareYears
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]",
                      )}
                    >
                      <GitCompareArrows className="w-3.5 h-3.5" />
                      {t("Compare to prior year")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                      "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]",
                      "focus-visible:ring-2 focus-visible:ring-primary outline-none disabled:opacity-50",
                    )}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? t("Exporting…") : t("Export")}
                  </button>
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                      "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]",
                      "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                    )}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {t("Print")}
                  </button>
                </div>
              </div>

              {/* Row 2: year nav + period selector + date range label */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {/* Year selector */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTaxYear((y) => Math.max(MIN_YEAR, y - 1))}
                    disabled={taxYear <= MIN_YEAR}
                    className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] disabled:opacity-30 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary outline-none"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center bg-[var(--color-hover)] rounded-lg p-0.5">
                    {recentYears.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setTaxYear(y)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                          "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                          taxYear === y
                            ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaxYear((y) => Math.min(currentYear, y + 1))}
                    disabled={taxYear >= currentYear}
                    className="p-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] disabled:opacity-30 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary outline-none"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {!isRecent && (
                    <span className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                      {taxYear}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-[var(--color-border)]" />

                {/* Period segmented control */}
                <div className="flex items-center bg-[var(--color-hover)] rounded-lg p-0.5 gap-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                        "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                        period === p
                          ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
                      )}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>

                {/* Active date range */}
                <span
                  className="text-xs text-[var(--color-text-secondary)] tabular-nums ml-1"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatDate(from)} &mdash; {formatDate(toInclusive)}
                </span>
              </div>
            </div>

            {/* Report content */}
            <div className="flex-1 bg-[var(--color-background)] print:bg-white py-4 print:py-0 overflow-auto">
              {compareYears && reportType !== "cash_flow" ? (
                <YearOverYearView
                  reportType={reportType}
                  currentFrom={from}
                  currentTo={toHalfOpen}
                  priorFrom={priorFrom}
                  priorTo={priorTo}
                  clientName={client.name}
                  currentYear={taxYear}
                  clientId={client.id}
                />
              ) : (
                <>
                  {reportType === "pnl" && (
                    <PnLView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={client.name}
                      clientId={client.id}
                    />
                  )}
                  {reportType === "balance_sheet" && (
                    <BalanceSheetView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={client.name}
                      mode={balanceSheetMode}
                      clientId={client.id}
                    />
                  )}
                  {reportType === "cash_flow" && (
                    <CashFlowView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={client.name}
                      clientId={client.id}
                    />
                  )}
                </>
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
        {tab === "mileage" && <MileagePage clientId={client.id} />}
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
