import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getNetCashTrend, type TrendBucket } from "../../lib/dashboard-api";
import { useI18n } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";

interface NetCashTrendChartProps {
  start: string;
  end: string;
  reducedMotion?: boolean;
  clientId?: string;
}

function bucketFor(start: string, end: string): TrendBucket {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  if (days <= 31) return "daily";
  if (days <= 180) return "weekly";
  return "monthly";
}

export function NetCashTrendChart({
  start,
  end,
  reducedMotion = false,
  clientId,
}: NetCashTrendChartProps) {
  const { t } = useI18n();
  const bucket = bucketFor(start, end);

  const { data = [], isLoading } = useQuery({
    queryKey: ["net_cash_trend", start, end, bucket, clientId],
    queryFn: () => getNetCashTrend(start, end, bucket, clientId),
    enabled: Boolean(start && end),
  });

  const chartData = data.map((p) => ({
    bucket: p.bucket,
    net: p.net_cents / 100,
  }));

  if (isLoading) {
    return <div className="w-full h-[200px] animate-pulse bg-gray-100 rounded-lg" />;
  }

  return (
    <div role="img" aria-label={t("Net cash trend line chart")} className="w-full">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
          <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
          <Tooltip formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)} />
          <Line
            type="stepAfter"
            dataKey="net"
            name={t("Net Cash")}
            stroke="var(--color-chart-net, #3b82f6)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={!reducedMotion}
          />
        </LineChart>
      </ResponsiveContainer>

      <table className="sr-only">
        <caption>{t("Net Cash Trend")}</caption>
        <thead>
          <tr>
            <th>{t("Period")}</th>
            <th>{t("Net Cash")}</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.bucket}>
              <td>{row.bucket}</td>
              <td>{formatCurrency(row.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
