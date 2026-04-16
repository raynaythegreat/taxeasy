import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import { type BalanceSheetLineItem, getBalanceSheet, getBalanceSheetCumulative } from "../../lib/tauri";
import { lastDayOf } from "../../lib/date-utils";
import { cn } from "../../lib/utils";
import { formatCurrency, formatDate } from "../../lib/utils";

type BalanceSheetMode = "period" | "cumulative";

interface BalanceSheetViewProps {
  /** Half-open upper bound date (first day of next period). */
  asOfDate: string;
  clientName?: string;
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
  return (
    <div className="animate-pulse space-y-3 p-8">
      {[...Array(10)].map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded ${i % 4 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function BalanceSheetView({ asOfDate, clientName }: BalanceSheetViewProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<BalanceSheetMode>("period");

  // For period mode: asOfDate is already the half-open upper bound passed from
  // periodRange(). getBalanceSheet() interprets this as the tax year range.
  // For cumulative mode: we need the inclusive last day (subtract 1 day).
  const inclusiveDate = lastDayOf(asOfDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ["balance_sheet", mode, asOfDate],
    queryFn: () =>
      mode === "period"
        ? getBalanceSheet(asOfDate)
        : getBalanceSheetCumulative(inclusiveDate),
  });

  const year = asOfDate.slice(0, 4);

  return (
    <div className="report-sheet">
      {/* Mode toggle — not printed */}
      <div className="flex justify-center mb-5 print:hidden">
        <div className="flex items-center bg-[var(--color-hover)] rounded-lg p-1 gap-0.5">
          {(["period", "cumulative"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer",
                "focus-visible:ring-2 focus-visible:ring-primary outline-none",
                mode === m
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
              )}
            >
              {m === "period"
                ? t("Period activity")
                : t("As of year-end (cumulative)")}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingSkeleton />}

      {error && !isLoading && (
        <div className="p-8 text-center text-red-600 text-sm">
          {t("Failed to load Balance Sheet. Please try again.")}
        </div>
      )}

      {data && !isLoading && (
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
              <span className="tabular-nums">{formatCurrency(data.total_liabilities_and_equity)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
