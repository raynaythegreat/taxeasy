import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GitCompareArrows,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Printer,
  Receipt,
  Sparkles,
  Users,
  Clock,
  FileCheck,
  Globe,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";

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
import { listClients, type Client } from "../lib/tauri";
import { cn, formatDate, PERIOD_LABELS, periodRange, type ReportPeriod } from "../lib/utils";
import { BusinessProfileEditModal } from "./BusinessProfileEditModal";
import { DashboardAnalytics } from "./dashboard/DashboardAnalytics";
import { TaxNewsFeed } from "./TaxNewsFeed";

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

interface DashboardWorkspaceProps {
  onNewClient: () => void;
}

export function DashboardWorkspace({ onNewClient }: DashboardWorkspaceProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
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

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const recentClients = useMemo(() => {
    if (!clients || clients.length === 0) return [];
    return [...clients]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [clients]);

  const ENTITY_LABELS_DASHBOARD: Record<string, string> = {
    sole_prop: t("Sole Proprietor"),
    smllc: t("SMLLC"),
    scorp: t("S-Corp"),
    ccorp: t("C-Corp"),
    partnership: t("Partnership"),
    i1040: t("1040 Individual"),
  };

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

  const businessName = profile?.name ?? t("My Business");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap print:hidden">
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
        <button
          type="button"
          onClick={onNewClient}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Users className="w-4 h-4" />
          {t("Add New Client")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
        {tab === "overview" && profile && (
          <div className="flex flex-col h-full">
            {/* Business Profile Header */}
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-5">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          {ENTITY_LABELS_DASHBOARD[profile.entity_type]}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {profile.accounting_method} {t("basis")}
                        </span>
                        {profile.ein && (
                          <span className="text-xs text-gray-500 font-mono">
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
                </div>
              </div>
            </div>

            {/* Business Profile Details */}
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                  {profile.contact_name && (
                    <>
                      <span className="text-gray-400">{t("Contact Name")}</span>
                      <span className="text-gray-900">{profile.contact_name}</span>
                    </>
                  )}
                  {profile.email && (
                    <>
                      <span className="text-gray-400">{t("Email")}</span>
                      <span className="text-gray-900 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        {profile.email}
                      </span>
                    </>
                  )}
                  {profile.phone && (
                    <>
                      <span className="text-gray-400">{t("Phone")}</span>
                      <span className="text-gray-900 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        {profile.phone}
                      </span>
                    </>
                  )}
                  {profile.website && (
                    <>
                      <span className="text-gray-400">{t("Website")}</span>
                      <span className="text-gray-900 flex items-center gap-1.5 break-all">
                        <Globe className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        {profile.website}
                      </span>
                    </>
                  )}
                  {profile.fiscal_year_start_month > 1 && (
                    <>
                      <span className="text-gray-400">{t("Fiscal Year Start")}</span>
                      <span className="text-gray-900">{profile.fiscal_year_start_month}/1</span>
                    </>
                  )}
                </div>
                <div className="text-sm">
                  {profile.address_line1 || profile.city || profile.state || profile.postal_code ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
                      <div className="text-gray-900 leading-5">
                        {profile.address_line1 && <div>{profile.address_line1}</div>}
                        {profile.address_line2 && <div>{profile.address_line2}</div>}
                        {[profile.city, profile.state, profile.postal_code].filter(Boolean).length >
                          0 && (
                          <div>
                            {[profile.city, profile.state, profile.postal_code]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        )}
                        {profile.country && <div>{profile.country}</div>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-gray-300">
                      <MapPin className="w-3.5 h-3.5 mt-0.5" />
                      <span>{t("No address set")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dashboard Analytics — stat cards, charts, recent txns */}
            <div className="shrink-0 bg-gray-50 px-6 py-6 border-b border-gray-200">
              <DashboardAnalytics
                clientId={OWNER_SCOPE}
                showTotalClientsCard={false}
                onOpenTransactions={() => setTab("transactions")}
                onOpenReports={() => setTab("reports")}
              />
            </div>

            {/* Tax News */}
            <div className="shrink-0 px-6 py-5 border-b border-gray-200 bg-white">
              <TaxNewsFeed clientId={OWNER_SCOPE} maxItems={3} />
            </div>

            {/* Recent Clients */}
            {recentClients.length > 0 && (
              <div className="shrink-0 px-6 py-5 border-b border-gray-200 bg-white">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700">{t("Recent Clients")}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {recentClients.map((client) => (
                    <RecentClientCard
                      key={client.id}
                      client={client}
                      entityLabels={ENTITY_LABELS_DASHBOARD}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}

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

function RecentClientCard({
  client,
  entityLabels,
  t,
}: {
  client: Client;
  entityLabels: Record<string, string>;
  t: (key: string) => string;
}) {
  const initials =
    client.name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-default">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{client.name}</p>
          <p className="text-xs text-gray-400">
            {entityLabels[client.entity_type] ?? client.entity_type}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
        <FileCheck className="w-3 h-3" />
        <span>{client.entity_type === "i1040" ? t("1040 Individual") : t("Business")}</span>
      </div>
    </div>
  );
}
