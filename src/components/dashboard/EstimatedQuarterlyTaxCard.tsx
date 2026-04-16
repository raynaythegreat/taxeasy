import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface EstimatedQuarterlyTaxCardProps {
  ytdNetIncome: string;
  estimatedTaxRate?: number;
  onViewDeadlines?: () => void;
}

interface QuarterInfo {
  label: string;
  dueDate: string;
  quarter: 1 | 2 | 3 | 4;
}

function currentQuarterInfo(now: Date): QuarterInfo {
  const month = now.getMonth() + 1; // 1-based
  const year = now.getFullYear();

  if (month <= 3) return { label: "Q1", dueDate: `April 15, ${year}`, quarter: 1 };
  if (month <= 5) return { label: "Q2", dueDate: `June 15, ${year}`, quarter: 2 };
  if (month <= 8) return { label: "Q3", dueDate: `September 15, ${year}`, quarter: 3 };
  return { label: "Q4", dueDate: `January 15, ${year + 1}`, quarter: 4 };
}

export function EstimatedQuarterlyTaxCard({
  ytdNetIncome,
  estimatedTaxRate = 0.25,
  onViewDeadlines,
}: EstimatedQuarterlyTaxCardProps) {
  const { t } = useI18n();
  const netIncome = parseFloat(ytdNetIncome);
  const estimatedTax = Math.max(netIncome * estimatedTaxRate, 0);
  const { label, dueDate } = currentQuarterInfo(new Date());

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t("Est. Quarterly Tax")} — {label}
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
            {formatCurrency(estimatedTax)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {(estimatedTaxRate * 100).toFixed(0)}% {t("of YTD net income")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{t("Due")}</p>
          <p className="text-xs font-semibold text-amber-600">{dueDate}</p>
        </div>
      </div>
      {onViewDeadlines && (
        <button
          type="button"
          onClick={onViewDeadlines}
          className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {t("View tax deadlines")} →
        </button>
      )}
    </div>
  );
}
