import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { handleExportReport } from "../../lib/export-api";
import { useI18n } from "../../lib/i18n";
import { triggerPrint } from "../../lib/print-utils";
import { getActiveClientId, listClients } from "../../lib/tauri";
import { cn, PERIOD_LABELS, periodRange, type ReportPeriod } from "../../lib/utils";
import { BalanceSheetView } from "./BalanceSheetView";
import { CashFlowView } from "./CashFlowView";
import { PnLView } from "./PnLView";

/**
 * `to` from periodRange() is half-open (the first day of the next period).
 * BalanceSheet's `asOfDate` is inclusive, so subtract one calendar day so that
 * "as of Q1 end" means March 31, not April 1.
 */
export function lastDayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type ReportTab = "pnl" | "balance_sheet" | "cash_flow";

const TABS: { id: ReportTab; label: string }[] = [
  { id: "pnl", label: "Profit & Loss" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow", label: "Cash Flow" },
];

const PERIODS: ReportPeriod[] = ["annual", "h1", "h2", "q1", "q2", "q3", "q4"];

const MIN_YEAR = 2000;

export function ReportsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReportTab>("pnl");
  const [period, setPeriod] = useState<ReportPeriod>("annual");

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [taxYear, setTaxYear] = useState(currentYear);
  const isRecent = recentYears.includes(taxYear);

  const { from, to } = useMemo(() => periodRange(taxYear, period), [taxYear, period]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const { data: activeClientId } = useQuery({
    queryKey: ["active_client_id"],
    queryFn: getActiveClientId,
  });

  const activeClient = clients?.find((c) => c.id === activeClientId);
  const clientName = activeClient?.name;

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await handleExportReport(activeTab, from, to);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("Export failed"));
      setTimeout(() => setExportError(null), 4000);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-background)]">
      {/* Page header */}
      <div className="shrink-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 pt-5 pb-3 print:hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("Reports")}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 tabular-nums">
              {clientName ? `${clientName} · ` : ""}
              {from} → {lastDayOf(to)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-text)] border border-[var(--color-border)] bg-[var(--color-surface)] rounded-lg hover:bg-[var(--color-hover)] transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? t("Exporting…") : t("Export")}
            </button>
            <button
              type="button"
              onClick={triggerPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-text)] border border-[var(--color-border)] bg-[var(--color-surface)] rounded-lg hover:bg-[var(--color-hover)] transition-colors"
            >
              <Printer className="w-4 h-4" />
              {t("Print")}
            </button>
          </div>
        </div>
      </div>

      {/* Sticky toolbar: tabs + period selectors */}
      <div className="sticky top-0 z-10 shrink-0 bg-[var(--color-surface)]/95 backdrop-blur border-b border-[var(--color-border)] px-6 py-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <nav className="flex items-center bg-[var(--color-hover)] rounded-lg p-1 gap-0.5">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
                )}
              >
                {t(tab.label)}
              </button>
            ))}
          </nav>

          <div className="ml-auto hidden sm:block" aria-hidden />
        </div>

        {/* Row 2: Year + Period selectors */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-1">
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
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200" />

          {/* Period selector */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  period === p
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-400 tabular-nums sm:hidden">
            {from} &mdash; {lastDayOf(to)}
          </span>
        </div>
      </div>

      {exportError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600">
          {exportError}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50 print:bg-white print:overflow-visible">
        <div className="min-h-full py-6 print:py-0">
          {activeTab === "pnl" && <PnLView dateFrom={from} dateTo={to} clientName={clientName} />}
          {activeTab === "balance_sheet" && (
            <BalanceSheetView asOfDate={lastDayOf(to)} clientName={clientName} />
          )}
          {activeTab === "cash_flow" && (
            <CashFlowView dateFrom={from} dateTo={to} clientName={clientName} />
          )}
        </div>
      </div>
    </div>
  );
}
