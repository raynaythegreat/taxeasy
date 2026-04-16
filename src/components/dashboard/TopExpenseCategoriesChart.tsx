import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTopCategories } from "../../lib/dashboard-api";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

const PALETTE = [
  "var(--color-chart-1, #f59e0b)",
  "var(--color-chart-2, #ef4444)",
  "var(--color-chart-3, #8b5cf6)",
  "var(--color-chart-4, #06b6d4)",
  "var(--color-chart-5, #ec4899)",
];

interface TopExpenseCategoriesChartProps {
  start: string;
  end: string;
  reducedMotion?: boolean;
}

export function TopExpenseCategoriesChart({
  start,
  end,
  reducedMotion = false,
}: TopExpenseCategoriesChartProps) {
  const { t } = useI18n();

  const { data = [], isLoading } = useQuery({
    queryKey: ["top_categories", start, end],
    queryFn: () => getTopCategories(start, end, 5),
    enabled: Boolean(start && end),
  });

  const chartData = data.map((c) => ({
    name: c.account_name,
    amount: c.total_cents / 100,
    pct: parseFloat(c.percentage) * 100,
  }));

  if (isLoading) {
    return <div className="w-full h-[200px] animate-pulse bg-gray-100 rounded-lg" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full h-[200px] flex items-center justify-center text-sm text-gray-400">
        {t("No expense data for this period.")}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={t("Top expense categories horizontal bar chart")}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
          />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v, _name, entry) => {
              const amount = typeof v === "number" ? v : 0;
              const pct = (entry?.payload?.pct ?? 0) as number;
              return `${formatCurrency(amount)} (${pct.toFixed(1)}%)`;
            }}
          />
          <Bar
            dataKey="amount"
            name={t("Amount")}
            isAnimationActive={!reducedMotion}
            radius={[0, 3, 3, 0]}
            label={{
              position: "right",
              formatter: (v: unknown) => `$${(typeof v === "number" ? v : 0).toLocaleString()}`,
              fontSize: 10,
            }}
          >
            {chartData.map((entry, i) => (
              <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <table className="sr-only">
        <caption>{t("Top Expense Categories")}</caption>
        <thead>
          <tr>
            <th>{t("Category")}</th>
            <th>{t("Amount")}</th>
            <th>{t("Percentage")}</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{formatCurrency(row.amount)}</td>
              <td>{row.pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
