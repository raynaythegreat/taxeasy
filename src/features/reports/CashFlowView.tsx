import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { lastDayOf } from "../../lib/date-utils";
import { useI18n } from "../../lib/i18n";
import { type CashFlowLineItem, getCashFlow } from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";

interface CashFlowViewProps {
  dateFrom: string;
  dateTo: string;
  clientName?: string;
  onChangePeriod?: () => void;
}

function LineRow({ item, indent }: { item: CashFlowLineItem; indent?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${indent ? "pl-6" : ""}`}>
      <span className="text-gray-700">{item.label}</span>
      <span className="text-gray-900 tabular-nums">{formatCurrency(item.amount)}</span>
    </div>
  );
}

function SubtotalRow({ label, amount, bold }: { label: string; amount: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
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
        <div
          key={row}
          className={`h-4 bg-gray-200 rounded ${i === 0 ? "w-1/3 mx-auto" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function CashFlowView({ dateFrom, dateTo, clientName, onChangePeriod }: CashFlowViewProps) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cash_flow", dateFrom, dateTo],
    queryFn: () => getCashFlow(dateFrom, dateTo),
    meta: { silent: true },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        {t("Failed to load Cash Flow statement. Please try again.")}
      </div>
    );
  }

  if (!data) return null;

  const isEmpty =
    parseFloat(data.net_income) === 0 &&
    parseFloat(data.net_change_in_cash) === 0 &&
    parseFloat(data.beginning_cash) === 0 &&
    parseFloat(data.ending_cash) === 0 &&
    data.operating_adjustments.length === 0 &&
    data.investing_activities.length === 0 &&
    data.financing_activities.length === 0;

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center py-16">
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title={t("No activity in this period")}
          description={t(
            "There are no cash flow transactions recorded for the selected date range.",
          )}
          action={
            onChangePeriod ? { label: t("Change period"), onClick: onChangePeriod } : undefined
          }
        />
      </div>
    );
  }

  const netChangeNum = parseFloat(data.net_change_in_cash);
  const netChangeColor = netChangeNum >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="report-sheet">
      <div className="text-center mb-8 print:mb-5">
        {clientName && <p className="text-base font-semibold text-gray-900">{clientName}</p>}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Statement of Cash Flows")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(dateFrom)} &ndash; {formatDate(lastDayOf(dateTo))}
        </p>
      </div>

      <SubtotalRow label={t("Net Income")} amount={data.net_income} />

      <div className="report-divider my-3 print:my-2" />

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Operating Activities")}
        </p>
        {data.operating_adjustments.map((item) => (
          <LineRow key={`${item.label}:${item.amount}`} item={item} indent />
        ))}
        {data.operating_adjustments.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No adjustments")}</p>
        )}
        <div className="report-divider mt-1" />
        <SubtotalRow
          label={t("Net Cash from Operations")}
          amount={data.net_cash_from_operations}
          bold
        />
      </section>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Investing Activities")}
        </p>
        {data.investing_activities.map((item) => (
          <LineRow key={`${item.label}:${item.amount}`} item={item} indent />
        ))}
        {data.investing_activities.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No activity")}</p>
        )}
        <div className="report-divider mt-1" />
        <SubtotalRow
          label={t("Net Cash from Investing")}
          amount={data.net_cash_from_investing}
          bold
        />
      </section>

      <section className="report-section">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Financing Activities")}
        </p>
        {data.financing_activities.map((item) => (
          <LineRow key={`${item.label}:${item.amount}`} item={item} indent />
        ))}
        {data.financing_activities.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No activity")}</p>
        )}
        <div className="report-divider mt-1" />
        <SubtotalRow
          label={t("Net Cash from Financing")}
          amount={data.net_cash_from_financing}
          bold
        />
      </section>

      <div className="report-divider-strong mt-4 pt-3 space-y-1 print:mt-3">
        <div className="flex justify-between py-1 font-bold text-base">
          <span className="text-gray-900">{t("Net Change in Cash")}</span>
          <span className={`tabular-nums ${netChangeColor}`}>
            {formatCurrency(data.net_change_in_cash)}
          </span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>{t("Beginning Cash")}</span>
          <span className="tabular-nums">{formatCurrency(data.beginning_cash)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-gray-900 border-t border-gray-300 pt-1">
          <span>{t("Ending Cash")}</span>
          <span className="tabular-nums">{formatCurrency(data.ending_cash)}</span>
        </div>
      </div>
    </div>
  );
}
