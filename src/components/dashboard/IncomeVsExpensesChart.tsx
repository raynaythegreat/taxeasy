import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface IncomeVsExpensesChartProps {
  revenue: number;
  expenses: number;
  priorRevenue?: number;
  priorExpenses?: number;
  reducedMotion?: boolean;
}

export function IncomeVsExpensesChart({
  revenue,
  expenses,
  priorRevenue = 0,
  priorExpenses = 0,
  reducedMotion = false,
}: IncomeVsExpensesChartProps) {
  const { t } = useI18n();

  const data = [
    {
      name: t("Current"),
      revenue,
      expenses,
    },
    {
      name: t("Prior Period"),
      revenue: priorRevenue,
      expenses: priorExpenses,
    },
  ];

  return (
    <div role="img" aria-label={t("Income vs Expenses grouped bar chart")} className="w-full">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
          <Tooltip
            formatter={(value) => formatCurrency((typeof value === "number" ? value : 0) / 100)}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="revenue"
            name={t("Revenue")}
            fill="var(--color-chart-revenue, #22c55e)"
            isAnimationActive={!reducedMotion}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="expenses"
            name={t("Expenses")}
            fill="var(--color-chart-expense, #f59e0b)"
            isAnimationActive={!reducedMotion}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Screen-reader table fallback */}
      <table className="sr-only">
        <caption>{t("Income vs Expenses")}</caption>
        <thead>
          <tr>
            <th>{t("Period")}</th>
            <th>{t("Revenue")}</th>
            <th>{t("Expenses")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{formatCurrency(row.revenue / 100)}</td>
              <td>{formatCurrency(row.expenses / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
