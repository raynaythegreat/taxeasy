import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Plus, Search, Upload } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../../lib/i18n";
import { listAccounts } from "../../lib/tauri";
import { fiscalYearRange, today } from "../../lib/utils";
import { CsvImportWizard } from "./CsvImportWizard";
import { ImportWizard } from "./ImportWizard";
import { LedgerView } from "./LedgerView";
import { RecurringTransactionsPage } from "./RecurringTransactionsPage";
import { TransactionForm } from "./TransactionForm";

const MIN_YEAR = 2000;

export function TransactionsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 8 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [taxYear, setTaxYear] = useState(currentYear);
  const [accountId, setAccountId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ledger" | "recurring">("ledger");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const isRecent = recentYears.includes(taxYear);

  const defaultTxnDate = useMemo(() => {
    if (taxYear === currentYear) return today();
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${taxYear}-${mm}-${dd}`;
  }, [taxYear, currentYear]);

  const { from, to } = useMemo(() => fiscalYearRange(taxYear), [taxYear]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const invalidateTxns = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const invalidateReports = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pnl"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["balance_sheet"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["cash_flow"], refetchType: "all" });
  }, [queryClient]);

  const handleDeleteTxn = useCallback(
    (_id: string) => {
      invalidateTxns();
      invalidateReports();
    },
    [invalidateTxns, invalidateReports],
  );

  const handleEditTxn = useCallback(() => {
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  const handleCreated = useCallback(() => {
    invalidateTxns();
    invalidateReports();
    setShowForm(false);
  }, [invalidateTxns, invalidateReports]);

  const handleImported = useCallback(() => {
    setShowImport(false);
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  const handleCsvImported = useCallback(() => {
    // Don't close yet — CsvImportWizard shows its own success screen;
    // parent just needs to invalidate queries so drafts refresh.
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  if (showForm) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {t("Back to Transactions")}
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-sm font-semibold text-gray-700">
            {t("New Transaction")} — {t("Tax Year")} {taxYear}
          </h1>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-5">
          <TransactionForm
            onClose={() => setShowForm(false)}
            onCreated={handleCreated}
            defaultDate={defaultTxnDate}
            taxYear={taxYear}
            onSaveAndNew={handleCreated}
          />
        </div>
      </div>
    );
  }

  // When CSV import wizard is open, render it full-height
  if (showCsvImport) {
    return (
      <div className="flex flex-col h-full">
        <CsvImportWizard
          onClose={() => setShowCsvImport(false)}
          onImported={handleCsvImported}
        />
      </div>
    );
  }

  // When receipt import wizard is open, render it full-height
  if (showImport) {
    return (
      <div className="flex flex-col h-full">
        <ImportWizard onClose={() => setShowImport(false)} onImported={handleImported} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-700">{t("Transactions")}</h1>
          {/* Tab switcher */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("ledger")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === "ledger"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("Ledger")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("recurring")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === "recurring"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("Recurring")}
            </button>
          </div>
          {/* Year picker — only relevant for ledger */}
          {activeTab === "ledger" && (
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
                <span className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                  {taxYear}
                </span>
              )}
            </div>
          )}
        </div>
        {activeTab === "ledger" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" />
              {t("Import")}
            </button>
            <button
              type="button"
              onClick={() => setShowCsvImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              {t("Import CSV")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              {t("New Transaction")}
            </button>
          </div>
        )}
      </div>

      {/* Ledger filters bar — only when on ledger tab */}
      {activeTab === "ledger" && (
        <div className="flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-200">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search transactions…")}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white w-56"
            />
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="">{t("All accounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-gray-400 tabular-nums">
            {from} &mdash; {to}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {activeTab === "recurring" ? (
          <RecurringTransactionsPage />
        ) : (
          <LedgerView
            dateFrom={from}
            dateTo={to}
            accountId={accountId || undefined}
            searchQuery={searchQuery || undefined}
            onDeleteTxn={handleDeleteTxn}
            onEditTxn={handleEditTxn}
          />
        )}
      </div>
    </div>
  );
}
