import { ArrowRight } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface RecentTransaction {
  id: string;
  txn_date: string;
  description: string;
  total_debit: string;
}

interface RecentTransactionsPanelProps {
  transactions: RecentTransaction[];
  onSelectTransaction?: (id: string) => void;
  onNavigate: (page: string) => void;
}

export function RecentTransactionsPanel({
  transactions,
  onSelectTransaction,
  onNavigate,
}: RecentTransactionsPanelProps) {
  const { t } = useI18n();

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {t("Recent Transactions")}
        </h2>
        <button
          type="button"
          onClick={() => onNavigate("transactions")}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {t("View All")}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          {t("No transactions yet.")}
        </div>
      ) : (
        <ul>
          {transactions.map((txn, i) => (
            <li
              key={txn.id}
              className={i < transactions.length - 1 ? "border-b border-gray-50" : ""}
            >
              <button
                type="button"
                onClick={() => onSelectTransaction?.(txn.id)}
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700 transition-colors">
                    {txn.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{txn.txn_date}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0 ml-4">
                  {formatCurrency(txn.total_debit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
