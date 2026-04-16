import { useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n";
import type { PeriodRange } from "../../lib/tauri";
import { AccountCompositionTreemap } from "./AccountCompositionTreemap";
import { IncomeVsExpensesChart } from "./IncomeVsExpensesChart";
import { NetCashTrendChart } from "./NetCashTrendChart";
import { TopExpenseCategoriesChart } from "./TopExpenseCategoriesChart";

interface ChartsRowProps {
  period: PeriodRange;
  revenueCents: number;
  expensesCents: number;
  accountBalances: Array<{ account_type: string; balance: string }>;
}

export function ChartsRow({
  period,
  revenueCents,
  expensesCents,
  accountBalances,
}: ChartsRowProps) {
  const { t } = useI18n();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t("Income vs Expenses")}
        </h3>
        <IncomeVsExpensesChart
          revenue={revenueCents}
          expenses={expensesCents}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t("Net Cash Trend")}
        </h3>
        <NetCashTrendChart start={period.start} end={period.end} reducedMotion={reducedMotion} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t("Top Expense Categories")}
        </h3>
        <TopExpenseCategoriesChart
          start={period.start}
          end={period.end}
          reducedMotion={reducedMotion}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t("Account Composition")}
        </h3>
        <AccountCompositionTreemap balances={accountBalances} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
