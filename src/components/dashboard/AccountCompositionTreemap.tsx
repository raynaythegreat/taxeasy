import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface AccountBalance {
  account_type: string;
  balance: string;
}

interface AccountCompositionTreemapProps {
  balances: AccountBalance[];
  reducedMotion?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  asset: "var(--color-chart-asset, #3b82f6)",
  liability: "var(--color-chart-liability, #ef4444)",
  equity: "var(--color-chart-equity, #8b5cf6)",
  revenue: "var(--color-chart-revenue, #22c55e)",
  expense: "var(--color-chart-expense, #f59e0b)",
};

export function AccountCompositionTreemap({
  balances,
  reducedMotion = false,
}: AccountCompositionTreemapProps) {
  const { t } = useI18n();

  const TYPE_LABELS: Record<string, string> = {
    asset: t("Assets"),
    liability: t("Liabilities"),
    equity: t("Equity"),
    revenue: t("Revenue"),
    expense: t("Expenses"),
  };

  const data = balances
    .map((ab) => {
      const parsed = parseFloat(ab.balance);
      const abs = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
      return {
        name: TYPE_LABELS[ab.account_type] ?? ab.account_type,
        type: ab.account_type,
        // Keep a tiny floor for recharts to render slivers, but only once we
        // know there's real non-zero data — filter below drops zero entries.
        value: Math.max(abs, 0.01),
        displayValue: Number.isFinite(parsed) ? parsed : 0,
        absValue: abs,
      };
    })
    // Only keep entries with an actual non-zero balance. Prevents an all-zero
    // period from rendering 5 equal slivers and a "$NaN" total.
    .filter((d) => d.absValue > 0);

  // Defense-in-depth: even if filtering missed something, a zero grand-total
  // would produce NaN in recharts' percentage math. Show empty state instead.
  const totalAbs = data.reduce((sum, d) => sum + d.absValue, 0);
  if (data.length === 0 || totalAbs === 0) {
    return (
      <div className="w-full h-[200px] flex items-center justify-center text-sm text-gray-500">
        {t("No account balance data for this period.")}
      </div>
    );
  }

  return (
    <div role="img" aria-label={t("Account composition treemap")} className="w-full">
      <ResponsiveContainer width="100%" height={200}>
        <Treemap
          data={data}
          dataKey="value"
          nameKey="name"
          isAnimationActive={!reducedMotion}
          content={({ x, y, width, height, name, type, displayValue }) => {
            const color = TYPE_COLORS[type as string] ?? "#94a3b8";
            return (
              <g>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  style={{ fill: color, stroke: "#fff", strokeWidth: 2, opacity: 0.85 }}
                />
                {width > 60 && height > 30 && (
                  <>
                    <text
                      x={(x as number) + (width as number) / 2}
                      y={(y as number) + (height as number) / 2 - 6}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize={11}
                      fontWeight={600}
                    >
                      {name as string}
                    </text>
                    <text
                      x={(x as number) + (width as number) / 2}
                      y={(y as number) + (height as number) / 2 + 10}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.85)"
                      fontSize={10}
                    >
                      {formatCurrency(displayValue as number)}
                    </text>
                  </>
                )}
              </g>
            );
          }}
        >
          <Tooltip
            formatter={(v, _n, entry) => {
              const display = entry?.payload?.displayValue;
              return formatCurrency(
                typeof display === "number" ? display : typeof v === "number" ? v : 0,
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>

      <table className="sr-only">
        <caption>{t("Account Composition")}</caption>
        <thead>
          <tr>
            <th>{t("Account Type")}</th>
            <th>{t("Balance")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.type}>
              <td>{row.name}</td>
              <td>{formatCurrency(row.displayValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
