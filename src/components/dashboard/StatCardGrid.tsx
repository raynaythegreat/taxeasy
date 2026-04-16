import { DollarSign, TrendingUp, Users } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { cn, formatCurrency } from "../../lib/utils";

interface StatCardGridProps {
  totalClients: number;
  ytdRevenue: string;
  ytdExpenses: string;
  ytdNetIncome: string;
  totalTransactions: number;
  onNavigate: (page: string) => void;
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "border rounded-xl p-5 flex items-center gap-3 text-left w-full",
        colorClass,
        onClick && "hover:opacity-90 transition-opacity cursor-pointer",
      )}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/40 shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </Tag>
  );
}

function StatSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-100 rounded w-16" />
          <div className="h-6 bg-gray-200 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

export function StatCardGrid({
  totalClients,
  ytdRevenue,
  ytdExpenses,
  ytdNetIncome,
  totalTransactions,
  onNavigate,
}: StatCardGridProps) {
  const { t } = useI18n();
  const netNum = parseFloat(ytdNetIncome);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        label={t("Total Clients")}
        value={String(totalClients)}
        icon={<Users className="w-5 h-5 text-purple-600" />}
        colorClass="bg-purple-50 border-purple-200 text-purple-700"
        onClick={() => onNavigate("clients")}
      />
      <StatCard
        label={t("YTD Revenue")}
        value={formatCurrency(ytdRevenue)}
        icon={<TrendingUp className="w-5 h-5 text-green-600" />}
        colorClass="bg-green-50 border-green-200 text-green-700"
        onClick={() => onNavigate("ledger")}
      />
      <StatCard
        label={t("YTD Expenses")}
        value={formatCurrency(ytdExpenses)}
        icon={<DollarSign className="w-5 h-5 text-amber-600" />}
        colorClass="bg-amber-50 border-amber-200 text-amber-700"
        onClick={() => onNavigate("ledger")}
      />
      <StatCard
        label={t("Net Income")}
        value={formatCurrency(ytdNetIncome)}
        icon={
          <DollarSign className={cn("w-5 h-5", netNum >= 0 ? "text-blue-600" : "text-red-600")} />
        }
        colorClass={
          netNum >= 0
            ? "bg-blue-50 border-blue-200 text-blue-700"
            : "bg-red-50 border-red-200 text-red-700"
        }
        onClick={() => onNavigate("reports")}
      />
      <StatCard
        label={t("Total Transactions")}
        value={String(totalTransactions)}
        icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
        colorClass="bg-indigo-50 border-indigo-200 text-indigo-700"
        onClick={() => onNavigate("transactions")}
      />
    </div>
  );
}

export { StatSkeleton };
