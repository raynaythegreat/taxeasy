import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Search } from "lucide-react";
import { listAccounts } from "../../lib/tauri";
import { fiscalYearRange } from "../../lib/utils";
import { LedgerView } from "./LedgerView";
import { TransactionForm } from "./TransactionForm";
import { ImportWizard } from "./ImportWizard";
import { useI18n } from "../../lib/i18n";

const _currentYear = new Date().getFullYear();
const { from: _defaultFrom, to: _defaultTo } = fiscalYearRange(_currentYear);

export function TransactionsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom] = useState(_defaultFrom);
  const [dateTo, setDateTo] = useState(_defaultTo);
  const [accountId, setAccountId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const invalidateTxns = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const invalidateReports = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pnl"], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ["balance_sheet"], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ["cash_flow"], refetchType: 'all' });
  }, [queryClient]);

  const handleDeleteTxn = useCallback(
    (_id: string) => {
      invalidateTxns();
      invalidateReports();
    },
    [invalidateTxns, invalidateReports]
  );

  const handleEditTxn = useCallback(() => {
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  const handleCreated = useCallback(() => {
    setShowForm(false);
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  const handleImported = useCallback(() => {
    setShowImport(false);
    invalidateTxns();
    invalidateReports();
  }, [invalidateTxns, invalidateReports]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-700">{t("Transactions")}</h1>
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
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            {t("New Transaction")}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search transactions…")}
            className="pl-8 pr-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white w-48"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">{t("From")}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">{t("To")}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">{t("Account")}</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="">{t("All accounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="px-5 pt-4 pb-2 bg-gray-50 border-b border-gray-200">
          <TransactionForm
            onClose={() => setShowForm(false)}
            onCreated={handleCreated}
          />
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {showImport ? (
          <ImportWizard
            onClose={() => setShowImport(false)}
            onImported={handleImported}
          />
        ) : (
          <LedgerView
            dateFrom={dateFrom || undefined}
            dateTo={dateTo || undefined}
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
