import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../lib/i18n";
import { type BalanceSheetLineItem, getBalanceSheet } from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";

interface BalanceSheetViewProps {
  asOfDate: string;
  clientName?: string;
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
  return (
    <div className="animate-pulse space-y-3 p-8">
      {[...Array(10)].map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded ${i % 4 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function BalanceSheetView({ asOfDate, clientName, onChangePeriod }: BalanceSheetViewProps) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["balance_sheet", asOfDate],
    queryFn: () => getBalanceSheet(asOfDate),
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        {t("Failed to load Balance Sheet. Please try again.")}
      </div>
    );
  }

  if (!data) return null;

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
          action={onChangePeriod ? { label: t("Change period"), onClick: onChangePeriod } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="report-sheet">
      <div className="text-center mb-6 print:mb-4">
        {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Balance Sheet")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("As of")} {formatDate(asOfDate)}
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
    </div>
  );
}
