import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { lastDayOf } from "../../lib/date-utils";
import { useI18n } from "../../lib/i18n";
import {
  type BalanceSheetLineItem,
  getBalanceSheet,
  getBalanceSheetCumulative,
} from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";

export type BalanceSheetMode = "period" | "cumulative";

interface BalanceSheetViewProps {
  /** Half-open lower bound (first day of period, inclusive). */
  dateFrom: string;
  /** Half-open upper bound (first day of next period, exclusive). */
  dateTo: string;
  clientName?: string;
  mode: BalanceSheetMode;
  onChangePeriod?: () => void;
}

function LineRow({ item }: { item: BalanceSheetLineItem }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-gray-700 pl-4">{item.name}</span>
      <span className="text-gray-900 tabular-nums">{formatCurrency(item.balance)}</span>
    </div>
  );
}

function SectionDivider() {
  return <div className="report-divider" />;
}

function SubtotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between py-1 text-sm font-semibold">
      <span className="text-gray-900">{label}</span>
      <span className="tabular-nums">{formatCurrency(amount)}</span>
    </div>
  );
}

function LoadingSkeleton() {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  return (
    <div className="animate-pulse space-y-3 p-8">
      {rows.map((row, i) => (
        <div key={row} className={`h-4 bg-gray-200 rounded ${i % 4 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function BalanceSheetView({
  dateFrom,
  dateTo,
  clientName,
  mode,
  onChangePeriod,
}: BalanceSheetViewProps) {
  const { t } = useI18n();

  // Cumulative mode wants an inclusive "as of" date: the last day of the period.
  const inclusiveDate = lastDayOf(dateTo);

  const { data, isLoading, error } = useQuery({
    queryKey: ["balance_sheet", mode, dateFrom, dateTo],
    queryFn: () =>
      mode === "period"
        ? getBalanceSheet(dateFrom, dateTo)
        : getBalanceSheetCumulative(inclusiveDate),
    meta: { silent: true },
  });

  // Use the inclusive last-day of the period for the year label (dateTo is the
  // half-open next-period start, so parsing its year would give the wrong tax year).
  const year = inclusiveDate.slice(0, 4);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <div role="alert" className="text-sm text-red-600 p-6">
        {t("Failed to load Balance Sheet. Please try again.")}
      </div>
    );
  }

  const isEmpty =
    data.asset_lines.length === 0 &&
    data.liability_lines.length === 0 &&
    data.equity_lines.length === 0 &&
    parseFloat(data.total_assets) === 0 &&
    parseFloat(data.total_liabilities) === 0 &&
    parseFloat(data.total_equity) === 0;

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center py-16">
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title={t("No activity in this period")}
          description={t("There are no balances recorded as of the selected date.")}
          action={
            onChangePeriod ? { label: t("Change period"), onClick: onChangePeriod } : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="report-sheet">
      {data && (
        <>
          <div className="text-center mb-6 print:mb-4">
            {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
            <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Balance Sheet")}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "period"
                ? t("Showing activity in {{year}}", { year })
                : `${t("Balance as of")} ${formatDate(data.as_of_date)}`}
            </p>
          </div>

          <section className="report-section">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              {t("Assets")}
            </p>
            {data.asset_lines.length > 0 ? (
              data.asset_lines.map((item) => <LineRow key={item.account_id} item={item} />)
            ) : (
              <p className="pl-4 text-sm text-gray-400 italic">{t("No asset accounts")}</p>
            )}
            <SectionDivider />
            <SubtotalRow label={t("Total Assets")} amount={data.total_assets} />
          </section>

          <section className="report-section">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              {t("Liabilities")}
            </p>
            {data.liability_lines.length > 0 ? (
              data.liability_lines.map((item) => <LineRow key={item.account_id} item={item} />)
            ) : (
              <p className="pl-4 text-sm text-gray-400 italic">{t("No liability accounts")}</p>
            )}
            <SectionDivider />
            <SubtotalRow label={t("Total Liabilities")} amount={data.total_liabilities} />
          </section>

          <section className="report-section">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              {t("Equity")}
            </p>
            {data.equity_lines.length > 0 ? (
              data.equity_lines.map((item) => <LineRow key={item.account_id} item={item} />)
            ) : (
              <p className="pl-4 text-sm text-gray-400 italic">{t("No equity accounts")}</p>
            )}
            <SectionDivider />
            <SubtotalRow label={t("Total Equity")} amount={data.total_equity} />
          </section>

          <div className="report-divider-strong mt-4 pt-2 print:mt-3">
            <div className="flex justify-between py-1 font-bold text-base">
              <span className="text-gray-900">{t("Total Liabilities & Equity")}</span>
              <span className="tabular-nums">
                {formatCurrency(data.total_liabilities_and_equity)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
