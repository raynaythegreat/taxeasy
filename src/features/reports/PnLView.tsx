import { useQuery } from "@tanstack/react-query";
import { lastDayOf } from "../../lib/date-utils";
import { useI18n } from "../../lib/i18n";
import { getPnl, type PnlLineItem } from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";

interface PnLViewProps {
  clientId: string;
  dateFrom: string;
  dateTo: string;
  clientName?: string;
  onChangePeriod?: () => void;
}

function LineRow({ item }: { item: PnlLineItem }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-gray-700 pl-4">{item.name}</span>
      <span className="text-gray-900 tabular-nums">{formatCurrency(item.amount)}</span>
    </div>
  );
}

function SectionDivider() {
  return <div className="report-divider" />;
}

function SubtotalRow({ label, amount, bold }: { label: string; amount: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : "font-medium"}`}>
      <span className="text-gray-900">{label}</span>
      <span className="tabular-nums">{formatCurrency(amount)}</span>
    </div>
  );
}

function LoadingSkeleton() {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return (
    <div className="animate-pulse space-y-3 p-8">
      {rows.map((row, i) => (
        <div key={row} className={`h-4 bg-gray-200 rounded ${i % 3 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function PnLView({ clientId, dateFrom, dateTo, clientName, onChangePeriod }: PnLViewProps) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["pnl", clientId, dateFrom, dateTo],
    queryFn: () => getPnl(dateFrom, dateTo, clientId),
    meta: { silent: true },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        {t("Failed to load Profit & Loss report. Please try again.")}
      </div>
    );
  }

  if (!data) return null;

  const hasRevenue = data.revenue_lines.length > 0;
  const hasCogs = data.cogs_lines.length > 0;
  const hasExpenses = data.expense_lines.length > 0;

  const isEmpty = !hasRevenue && !hasCogs && !hasExpenses && parseFloat(data.net_income) === 0;
  const netIncomeNum = parseFloat(data.net_income);
  const netIncomeColor = netIncomeNum >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="report-sheet">
      <div className="text-center mb-6 print:mb-4">
        {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Profit & Loss")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(dateFrom)} &ndash; {formatDate(lastDayOf(dateTo))}
        </p>
      </div>

      {isEmpty && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 print:hidden">
          {t("There are no transactions recorded for the selected date range.")}
          {onChangePeriod && (
            <button
              type="button"
              onClick={onChangePeriod}
              className="ml-2 font-medium text-blue-600 hover:text-blue-700"
            >
              {t("Change period")}
            </button>
          )}
        </div>
      )}

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Revenue")}
        </p>
        {hasRevenue ? (
          data.revenue_lines.map((item) => <LineRow key={item.account_id} item={item} />)
        ) : (
          <p className="pl-4 text-sm text-gray-400 italic">{t("No revenue activity")}</p>
        )}
        <SectionDivider />
        <SubtotalRow label={t("Total Revenue")} amount={data.total_revenue} />
      </section>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Cost of Goods Sold")}
        </p>
        {hasCogs ? (
          data.cogs_lines.map((item) => <LineRow key={item.account_id} item={item} />)
        ) : (
          <p className="pl-4 text-sm text-gray-400 italic">{t("No cost of goods sold activity")}</p>
        )}
        <SectionDivider />
        <SubtotalRow label={t("Total COGS")} amount={data.total_cogs} />
      </section>

      <div className="flex justify-between py-1.5 text-sm font-semibold border-t border-b border-gray-400 my-3 print:my-2">
        <span>{t("Gross Profit")}</span>
        <span className="tabular-nums">{formatCurrency(data.gross_profit)}</span>
      </div>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Operating Expenses")}
        </p>
        {hasExpenses ? (
          data.expense_lines.map((item) => <LineRow key={item.account_id} item={item} />)
        ) : (
          <p className="pl-4 text-sm text-gray-400 italic">{t("No operating expense activity")}</p>
        )}
        <SectionDivider />
        <SubtotalRow label={t("Total Operating Expenses")} amount={data.total_expenses} />
      </section>

      <div className="report-divider-strong mt-4 pt-2 print:mt-3">
        <div className="flex justify-between py-1 font-bold text-base">
          <span className="text-gray-900">{t("Net Income")}</span>
          <span className={`tabular-nums ${netIncomeColor}`}>
            {formatCurrency(data.net_income)}
          </span>
        </div>
      </div>
    </div>
  );
}
