import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../lib/i18n";
import {
  getBalanceSheet,
  getPnl,
  type BalanceSheetReport,
  type PnlReport,
} from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";
import { cn } from "../../lib/utils";

interface YearOverYearViewProps {
  reportType: "pnl" | "balance_sheet";
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
  clientName?: string;
  currentYear: number;
}

function SectionDivider() {
  return <div className="report-divider" />;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-8">
      {[...Array(8)].map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded ${i % 3 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** A single row in the comparison table. */
function CompareRow({
  label,
  current,
  prior,
  bold,
  indent,
  colorCurrent,
}: {
  label: string;
  current: string;
  prior: string;
  bold?: boolean;
  indent?: boolean;
  colorCurrent?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto_auto] gap-x-6 py-0.5 text-sm", bold && "font-semibold")}>
      <span className={cn("truncate", indent ? "pl-4 text-gray-700" : "text-gray-900")}>
        {label}
      </span>
      <span className={cn("tabular-nums text-right w-24", colorCurrent ?? "text-gray-900")}>
        {formatCurrency(current)}
      </span>
      <span className="tabular-nums text-right w-24 text-gray-500">
        {formatCurrency(prior)}
      </span>
    </div>
  );
}

function YearHeader({ currentYear }: { currentYear: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
      <span />
      <span className="text-right w-24">{currentYear}</span>
      <span className="text-right w-24">{currentYear - 1}</span>
    </div>
  );
}

// ── P&L comparison ─────────────────────────────────────────────────────────

function PnLComparison({
  current,
  prior,
  currentYear,
  clientName,
  currentFrom,
  currentTo,
}: {
  current: PnlReport;
  prior: PnlReport;
  currentYear: number;
  clientName?: string;
  currentFrom: string;
  currentTo: string;
}) {
  const { t } = useI18n();
  const netIncomeColor =
    parseFloat(current.net_income) >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="report-sheet">
      <div className="text-center mb-6 print:mb-4">
        {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Profit & Loss")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("Year-over-Year Comparison")} &mdash; {formatDate(currentFrom)} &ndash; {formatDate(currentTo)}
        </p>
      </div>

      <YearHeader currentYear={currentYear} />

      {(current.revenue_lines.length > 0 || prior.revenue_lines.length > 0) && (
        <section className="report-section">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            {t("Revenue")}
          </p>
          {current.revenue_lines.map((item) => {
            const priorItem = prior.revenue_lines.find((p) => p.account_id === item.account_id);
            return (
              <CompareRow
                key={item.account_id}
                label={item.name}
                current={item.amount}
                prior={priorItem?.amount ?? "0"}
                indent
              />
            );
          })}
          <SectionDivider />
          <CompareRow
            label={t("Total Revenue")}
            current={current.total_revenue}
            prior={prior.total_revenue}
            bold
          />
        </section>
      )}

      {(current.expense_lines.length > 0 || prior.expense_lines.length > 0) && (
        <section className="report-section">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            {t("Operating Expenses")}
          </p>
          {current.expense_lines.map((item) => {
            const priorItem = prior.expense_lines.find((p) => p.account_id === item.account_id);
            return (
              <CompareRow
                key={item.account_id}
                label={item.name}
                current={item.amount}
                prior={priorItem?.amount ?? "0"}
                indent
              />
            );
          })}
          <SectionDivider />
          <CompareRow
            label={t("Total Operating Expenses")}
            current={current.total_expenses}
            prior={prior.total_expenses}
            bold
          />
        </section>
      )}

      <div className="report-divider-strong mt-4 pt-2 print:mt-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-1 font-bold text-base">
          <span className="text-gray-900">{t("Net Income")}</span>
          <span className={cn("tabular-nums text-right w-24", netIncomeColor)}>
            {formatCurrency(current.net_income)}
          </span>
          <span className={cn(
            "tabular-nums text-right w-24",
            parseFloat(prior.net_income) >= 0 ? "text-green-700" : "text-red-600",
          )}>
            {formatCurrency(prior.net_income)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Balance Sheet comparison ────────────────────────────────────────────────

function BalanceSheetComparison({
  current,
  prior,
  currentYear,
  clientName,
}: {
  current: BalanceSheetReport;
  prior: BalanceSheetReport;
  currentYear: number;
  clientName?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="report-sheet">
      <div className="text-center mb-6 print:mb-4">
        {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Balance Sheet")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("Year-over-Year Comparison")}</p>
      </div>

      <YearHeader currentYear={currentYear} />

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Assets")}
        </p>
        {current.asset_lines.map((item) => {
          const priorItem = prior.asset_lines.find((p) => p.account_id === item.account_id);
          return (
            <CompareRow
              key={item.account_id}
              label={item.name}
              current={item.balance}
              prior={priorItem?.balance ?? "0"}
              indent
            />
          );
        })}
        <SectionDivider />
        <CompareRow label={t("Total Assets")} current={current.total_assets} prior={prior.total_assets} bold />
      </section>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Liabilities")}
        </p>
        {current.liability_lines.map((item) => {
          const priorItem = prior.liability_lines.find((p) => p.account_id === item.account_id);
          return (
            <CompareRow
              key={item.account_id}
              label={item.name}
              current={item.balance}
              prior={priorItem?.balance ?? "0"}
              indent
            />
          );
        })}
        <SectionDivider />
        <CompareRow label={t("Total Liabilities")} current={current.total_liabilities} prior={prior.total_liabilities} bold />
      </section>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Equity")}
        </p>
        {current.equity_lines.map((item) => {
          const priorItem = prior.equity_lines.find((p) => p.account_id === item.account_id);
          return (
            <CompareRow
              key={item.account_id}
              label={item.name}
              current={item.balance}
              prior={priorItem?.balance ?? "0"}
              indent
            />
          );
        })}
        <SectionDivider />
        <CompareRow label={t("Total Equity")} current={current.total_equity} prior={prior.total_equity} bold />
      </section>

      <div className="report-divider-strong mt-4 pt-2 print:mt-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-1 font-bold text-base">
          <span className="text-gray-900">{t("Total Liabilities & Equity")}</span>
          <span className="tabular-nums text-right w-24">{formatCurrency(current.total_liabilities_and_equity)}</span>
          <span className="tabular-nums text-right w-24 text-gray-500">{formatCurrency(prior.total_liabilities_and_equity)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function YearOverYearView({
  reportType,
  currentFrom,
  currentTo,
  priorFrom,
  priorTo,
  clientName,
  currentYear,
}: YearOverYearViewProps) {
  const { t } = useI18n();

  const pnlCurrentQuery = useQuery({
    queryKey: ["pnl", currentFrom, currentTo],
    queryFn: () => getPnl(currentFrom, currentTo),
    enabled: reportType === "pnl",
  });

  const pnlPriorQuery = useQuery({
    queryKey: ["pnl", priorFrom, priorTo],
    queryFn: () => getPnl(priorFrom, priorTo),
    enabled: reportType === "pnl",
  });

  const bsCurrentQuery = useQuery({
    queryKey: ["balance_sheet", "period", currentFrom, currentTo],
    queryFn: () => getBalanceSheet(currentFrom, currentTo),
    enabled: reportType === "balance_sheet",
  });

  const bsPriorQuery = useQuery({
    queryKey: ["balance_sheet", "period", priorFrom, priorTo],
    queryFn: () => getBalanceSheet(priorFrom, priorTo),
    enabled: reportType === "balance_sheet",
  });

  const isLoading =
    reportType === "pnl"
      ? pnlCurrentQuery.isLoading || pnlPriorQuery.isLoading
      : bsCurrentQuery.isLoading || bsPriorQuery.isLoading;

  const hasError =
    reportType === "pnl"
      ? pnlCurrentQuery.error || pnlPriorQuery.error
      : bsCurrentQuery.error || bsPriorQuery.error;

  if (isLoading) return <LoadingSkeleton />;

  if (hasError) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        {t("Failed to load comparison report. Please try again.")}
      </div>
    );
  }

  if (reportType === "pnl" && pnlCurrentQuery.data && pnlPriorQuery.data) {
    return (
      <PnLComparison
        current={pnlCurrentQuery.data}
        prior={pnlPriorQuery.data}
        currentYear={currentYear}
        clientName={clientName}
        currentFrom={currentFrom}
        currentTo={currentTo}
      />
    );
  }

  if (reportType === "balance_sheet" && bsCurrentQuery.data && bsPriorQuery.data) {
    return (
      <BalanceSheetComparison
        current={bsCurrentQuery.data}
        prior={bsPriorQuery.data}
        currentYear={currentYear}
        clientName={clientName}
      />
    );
  }

  return null;
}
