import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download } from "lucide-react";
import { listClients, getActiveClientId } from "../../lib/tauri";
import { today, fiscalYearRange, cn } from "../../lib/utils";
import { handleExportReport } from "../../lib/export-api";
import { useI18n } from "../../lib/i18n";
import { PnLView } from "./PnLView";
import { BalanceSheetView } from "./BalanceSheetView";
import { CashFlowView } from "./CashFlowView";

type ReportTab = "pnl" | "balance_sheet" | "cash_flow";

const TABS: { id: ReportTab; label: string }[] = [
  { id: "pnl", label: "Profit & Loss" },
  { id: "balance_sheet", label: "Balance Sheet" },
  { id: "cash_flow", label: "Cash Flow" },
];

const currentYear = new Date().getFullYear();
const defaultRange = fiscalYearRange(currentYear);

export function ReportsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReportTab>("pnl");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [asOfDate, setAsOfDate] = useState(today());
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

  function handlePrint() {
    window.print();
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await handleExportReport(activeTab, dateFrom, dateTo);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("Export failed"));
      setTimeout(() => setExportError(null), 4000);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-4 print:hidden">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {t(tab.label)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          {activeTab === "balance_sheet" ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
                {t("As of")}
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
                {t("From")}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
                {t("To")}
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
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? t("Exporting…") : t("Download CSV")}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            {t("Print")}
          </button>
        </div>
      </div>

      {exportError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600">
          {exportError}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50 print:bg-white print:overflow-visible">
        <div className="min-h-full py-6 print:py-0">
          {activeTab === "pnl" && (
            <PnLView dateFrom={dateFrom} dateTo={dateTo} clientName={clientName} />
          )}
          {activeTab === "balance_sheet" && (
            <BalanceSheetView asOfDate={asOfDate} clientName={clientName} />
          )}
          {activeTab === "cash_flow" && (
            <CashFlowView dateFrom={dateFrom} dateTo={dateTo} clientName={clientName} />
          )}
        </div>
      </div>
    </div>
  );
}
