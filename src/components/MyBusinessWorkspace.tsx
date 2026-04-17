import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GitCompareArrows,
  Loader2,
  Printer,
  Receipt,
  Sparkles,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { AccountManagementPage } from "../features/accounts/AccountManagementPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { type BalanceSheetMode, BalanceSheetView } from "../features/reports/BalanceSheetView";
import { CashFlowView } from "../features/reports/CashFlowView";
import { PnLView } from "../features/reports/PnLView";
import { YearOverYearView } from "../features/reports/YearOverYearView";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { getBusinessProfile } from "../lib/business-profile-api";
import { lastDayOf } from "../lib/date-utils";
import { handleExportReport } from "../lib/export-api";
import { useI18n } from "../lib/i18n";
import { triggerPrint } from "../lib/print-utils";
import { cn, formatDate, PERIOD_LABELS, periodRange, type ReportPeriod } from "../lib/utils";
import { BusinessProfileEditModal } from "./BusinessProfileEditModal";
import { DashboardAnalytics } from "./dashboard/DashboardAnalytics";

const AiWorkspace = lazy(() =>
  import("../features/ai/AiWorkspace").then((m) => ({ default: m.AiWorkspace })),
);

export type WorkspaceTab =
  | "overview"
  | "transactions"
  | "invoices"
  | "documents"
  | "reports"
  | "ai";

const PERIODS: ReportPeriod[] = ["annual", "h1", "h2", "q1", "q2", "q3", "q4"];
const MIN_YEAR = 2000;
const OWNER_SCOPE = "owner";

interface MyBusinessWorkspaceProps {
  initialTab?: WorkspaceTab;
  onOpenTaxNews?: (clientId?: string) => void;
}

export function MyBusinessWorkspace({
  initialTab = "overview",
  onOpenTaxNews,
}: MyBusinessWorkspaceProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [reportType, setReportType] = useState<"pnl" | "balance_sheet" | "cash_flow">("pnl");
  const [balanceSheetMode, setBalanceSheetMode] = useState<BalanceSheetMode>("period");
  const [period, setPeriod] = useState<ReportPeriod>("annual");
  const [compareYears, setCompareYears] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["business_profile"],
    queryFn: getBusinessProfile,
  });

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

  const WORKSPACE_TABS: { id: WorkspaceTab; label: string; icon?: React.ReactNode }[] = [
    { id: "overview", label: t("Overview") },
    { id: "transactions", label: t("Transactions"), icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: "invoices", label: t("Invoices"), icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "documents", label: t("Documents") },
    { id: "reports", label: t("Reports"), icon: <Printer className="w-3.5 h-3.5" /> },
    { id: "ai", label: t("ai.workspaceTitle"), icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const ENTITY_LABELS: Record<string, string> = {
    sole_prop: t("Sole Proprietor"),
    smllc: t("SMLLC"),
    scorp: t("S-Corp"),
    ccorp: t("C-Corp"),
    partnership: t("Partnership"),
  };

  const { from, to: toHalfOpen } = useMemo(() => periodRange(taxYear, period), [taxYear, period]);
  const toInclusive = lastDayOf(toHalfOpen);
  const { from: priorFrom, to: priorTo } = useMemo(
    () => periodRange(taxYear - 1, period),
    [taxYear, period],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await handleExportReport(reportType, from, toHalfOpen, OWNER_SCOPE);
    } finally {
      setExporting(false);
    }
  }

  function openWorkspaceTab(nextTab: WorkspaceTab) {
    setTab(nextTab);
  }

  const businessName = profile?.name ?? t("My Business");

  return (
    <div className="flex flex-col h-full">
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
        {tab === "overview" && profile && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-5">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{profile.name}</h2>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {ENTITY_LABELS[profile.entity_type]}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {profile.accounting_method} {t("basis")}
                        </span>
                        {profile.ein && (
                          <span className="text-xs text-gray-500">
                            {t("EIN")}: {profile.ein}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {t("Edit Profile")}
                    </button>
                  </div>
                  <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
                    {profile.fiscal_year_start_month > 1 && (
                      <span>
                        {t("Fiscal Year Start")}: {profile.fiscal_year_start_month}/1
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 bg-gray-50 px-6 py-6 border-b border-gray-200">
              <DashboardAnalytics
                clientId={OWNER_SCOPE}
                showTotalClientsCard={false}
                onOpenTransactions={() => openWorkspaceTab("transactions")}
                onOpenReports={() => openWorkspaceTab("reports")}
                onOpenTaxNews={onOpenTaxNews}
              />
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <AccountManagementPage compact clientId={OWNER_SCOPE} />
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <InvoicesPage compact clientId={OWNER_SCOPE} />
            </div>
            <div className="shrink-0 border-t border-gray-200">
              <DocumentsPage compact clientId={OWNER_SCOPE} />
            </div>
          </div>
        )}
        {tab === "transactions" && <TransactionsPage clientId={OWNER_SCOPE} />}
        {tab === "invoices" && <InvoicesPage clientId={OWNER_SCOPE} />}
        {tab === "documents" && <DocumentsPage clientId={OWNER_SCOPE} />}
        {tab === "reports" && (
          <div className="flex flex-col h-full">
            <div className="sticky top-0 z-10 shrink-0 backdrop-blur bg-white/95 border-b border-gray-200 px-5 py-3 print:hidden shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
                  {(["pnl", "balance_sheet", "cash_flow"] as const).map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReportType(rt)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        reportType === rt
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-900",
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
                    <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
                      {(["period", "cumulative"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setBalanceSheetMode(mode)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md",
                            balanceSheetMode === mode
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-900",
                          )}
                        >
                          {mode === "period"
                            ? t("Period activity")
                            : t("As of year-end (cumulative)")}
                        </button>
                      ))}
                    </div>
                  )}
                  {reportType !== "cash_flow" && (
                    <button
                      type="button"
                      onClick={() => setCompareYears((v) => !v)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border",
                        compareYears
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "border-gray-200 text-gray-500 hover:bg-gray-100",
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? t("Exporting…") : t("Export")}
                  </button>
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {t("Print")}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTaxYear((y) => Math.max(MIN_YEAR, y - 1))}
                    disabled={taxYear <= MIN_YEAR}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    {recentYears.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setTaxYear(y)}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-md",
                          taxYear === y
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-900",
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
                    className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {!isRecent && (
                    <span className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                      {taxYear}
                    </span>
                  )}
                </div>
                <div className="w-px h-4 bg-gray-200" />
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md",
                        period === p
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-900",
                      )}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-500 tabular-nums ml-1">
                  {formatDate(from)} &mdash; {formatDate(toInclusive)}
                </span>
              </div>
            </div>
            <div className="flex-1 bg-gray-50 print:bg-white min-h-full py-6 print:py-0 overflow-auto">
              {compareYears && reportType !== "cash_flow" ? (
                <YearOverYearView
                  reportType={reportType}
                  currentFrom={from}
                  currentTo={toHalfOpen}
                  priorFrom={priorFrom}
                  priorTo={priorTo}
                  clientName={businessName}
                  clientId={OWNER_SCOPE}
                  currentYear={taxYear}
                />
              ) : (
                <>
                  {reportType === "pnl" && (
                    <PnLView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={businessName}
                      clientId={OWNER_SCOPE}
                    />
                  )}
                  {reportType === "balance_sheet" && (
                    <BalanceSheetView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={businessName}
                      mode={balanceSheetMode}
                      clientId={OWNER_SCOPE}
                    />
                  )}
                  {reportType === "cash_flow" && (
                    <CashFlowView
                      dateFrom={from}
                      dateTo={toHalfOpen}
                      clientName={businessName}
                      clientId={OWNER_SCOPE}
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
            <AiWorkspace clientId={OWNER_SCOPE} />
          </Suspense>
        )}
      </div>
      {editingProfile && profile && (
        <BusinessProfileEditModal
          profile={profile}
          onClose={() => setEditingProfile(false)}
          onSaved={() => setEditingProfile(false)}
        />
      )}
    </div>
  );
}
