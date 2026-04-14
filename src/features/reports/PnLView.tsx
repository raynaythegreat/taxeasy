import { useQuery } from "@tanstack/react-query";
import { getPnl, type PnlLineItem } from "../../lib/tauri";
import { formatCurrency, formatDate } from "../../lib/utils";

interface PnLViewProps {
  dateFrom: string;
  dateTo: string;
  clientName?: string;
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
  return <div className="border-t border-gray-300 my-1" />;
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
  return (
    <div className="animate-pulse space-y-3 p-8">
      {[...Array(8)].map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded ${i % 3 === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function PnLView({ dateFrom, dateTo, clientName }: PnLViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pnl", dateFrom, dateTo],
    queryFn: () => getPnl(dateFrom, dateTo),
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        Failed to load Profit &amp; Loss report. Please try again.
      </div>
    );
  }

  if (!data) return null;

  const hasRevenue = data.revenue_lines.length > 0;
  const hasCogs = data.cogs_lines.length > 0;
  const hasExpenses = data.expense_lines.length > 0;
  const netIncomeNum = parseFloat(data.net_income);
  const netIncomeColor = netIncomeNum >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="max-w-2xl mx-auto p-8 print:p-6 print:max-w-none bg-white print:shadow-none print:border-none">
      {/* Report header */}
      <div className="text-center mb-6">
        {clientName && (
          <p className="text-base font-semibold text-gray-900">{clientName}</p>
        )}
        <h2 className="text-xl font-bold text-gray-900 mt-1">Profit &amp; Loss</h2>
        <p className="text-sm text-gray-500 mt-1">
          {formatDate(dateFrom)} &ndash; {formatDate(dateTo)}
        </p>
      </div>

      {/* REVENUE */}
      {hasRevenue && (
        <section className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Revenue</p>
          {data.revenue_lines.map((item) => (
            <LineRow key={item.account_id} item={item} />
          ))}
          <SectionDivider />
          <SubtotalRow label="Total Revenue" amount={data.total_revenue} />
        </section>
      )}

      {/* COGS */}
      {hasCogs && (
        <section className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Cost of Goods Sold
          </p>
          {data.cogs_lines.map((item) => (
            <LineRow key={item.account_id} item={item} />
          ))}
          <SectionDivider />
          <SubtotalRow label="Total COGS" amount={data.total_cogs} />
        </section>
      )}

      {/* Gross Profit (only when COGS present) */}
      {hasCogs && (
        <div className="flex justify-between py-1.5 text-sm font-semibold border-t border-b border-gray-400 my-3">
          <span>Gross Profit</span>
          <span className="tabular-nums">{formatCurrency(data.gross_profit)}</span>
        </div>
      )}

      {/* OPERATING EXPENSES */}
      {hasExpenses && (
        <section className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            Operating Expenses
          </p>
          {data.expense_lines.map((item) => (
            <LineRow key={item.account_id} item={item} />
          ))}
          <SectionDivider />
          <SubtotalRow label="Total Operating Expenses" amount={data.total_expenses} />
        </section>
      )}

      {/* Net Income */}
      <div className="border-t-2 border-gray-800 mt-4 pt-2">
        <div className="flex justify-between py-1 font-bold text-base">
          <span className="text-gray-900">Net Income</span>
          <span className={`tabular-nums ${netIncomeColor}`}>
            {formatCurrency(data.net_income)}
          </span>
        </div>
      </div>
    </div>
  );
}
