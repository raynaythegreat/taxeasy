import { useQuery } from "@tanstack/react-query";
import { getDeductibleExpenses } from "../../lib/dashboard-api";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface DeductibleExpensesCardProps {
  start: string;
  end: string;
  clientId?: string;
}

export function DeductibleExpensesCard({ start, end, clientId }: DeductibleExpensesCardProps) {
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["deductible_expenses", start, end, clientId],
    queryFn: () => getDeductibleExpenses(start, end, clientId),
    enabled: Boolean(start && end),
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
        <div className="h-3 bg-gray-100 rounded w-32 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-24" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {t("Deductible Expenses")}
      </p>
      <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
        {formatCurrency(data?.total ?? "0")}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {t("Expenses flagged as deductible in this period")}
      </p>
    </div>
  );
}
