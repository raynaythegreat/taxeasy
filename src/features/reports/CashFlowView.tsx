import { useQuery } from "@tanstack/react-query";
import { getCashFlow, type CashFlowLineItem } from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface CashFlowViewProps {
  dateFrom: string;
  dateTo: string;
  clientName?: string;
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
  return (
    <div className="animate-pulse space-y-3 p-8">
      {[...Array(8)].map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded ${i === 0 ? "w-1/3 mx-auto" : "w-full"}`} />
      ))}
    </div>
  );
}

export function CashFlowView({ dateFrom, dateTo, clientName }: CashFlowViewProps) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cash_flow", dateFrom, dateTo],
    queryFn: () => getCashFlow(dateFrom, dateTo),
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

  const netChangeNum = parseFloat(data.net_change_in_cash);
  const netChangeColor = netChangeNum >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="max-w-2xl mx-auto p-8 print:p-6 print:max-w-none bg-white shadow-sm rounded-lg print:shadow-none print:rounded-none">
      <div className="text-center mb-8">
        {clientName && (
          <p className="text-base font-semibold text-gray-900">{clientName}</p>
        )}
        <h2 className="text-xl font-bold text-gray-900 mt-1">{t("Statement of Cash Flows")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(dateFrom)} &ndash; {formatDate(dateTo)}
        </p>
      </div>

      <SubtotalRow label={t("Net Income")} amount={data.net_income} />

      <div className="border-t border-gray-200 my-3" />

      <section className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Operating Activities")}
        </p>
        {data.operating_adjustments.map((item, i) => (
          <LineRow key={i} item={item} indent />
        ))}
        {data.operating_adjustments.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No adjustments")}</p>
        )}
        <div className="border-t border-gray-200 mt-1" />
        <SubtotalRow label={t("Net Cash from Operations")} amount={data.net_cash_from_operations} bold />
      </section>

      <section className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Investing Activities")}
        </p>
        {data.investing_activities.map((item, i) => (
          <LineRow key={i} item={item} indent />
        ))}
        {data.investing_activities.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No activity")}</p>
        )}
        <div className="border-t border-gray-200 mt-1" />
        <SubtotalRow label={t("Net Cash from Investing")} amount={data.net_cash_from_investing} bold />
      </section>

      <section className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
          {t("Financing Activities")}
        </p>
        {data.financing_activities.map((item, i) => (
          <LineRow key={i} item={item} indent />
        ))}
        {data.financing_activities.length === 0 && (
          <p className="pl-6 text-sm text-gray-400 italic py-0.5">{t("No activity")}</p>
        )}
        <div className="border-t border-gray-200 mt-1" />
        <SubtotalRow label={t("Net Cash from Financing")} amount={data.net_cash_from_financing} bold />
      </section>

      <div className="border-t-2 border-gray-800 mt-4 pt-3 space-y-1">
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
