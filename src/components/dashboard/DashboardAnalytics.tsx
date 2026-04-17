import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { getDashboardStats } from "../../lib/dashboard-api";
import { useI18n } from "../../lib/i18n";
import type { PeriodRange } from "../../lib/tauri";
import { PeriodPicker } from "../PeriodPicker";
import { EmptyState } from "../ui/EmptyState";
import { ChartsRow } from "./ChartsRow";
import { DeductibleExpensesCard } from "./DeductibleExpensesCard";
import { EstimatedQuarterlyTaxCard } from "./EstimatedQuarterlyTaxCard";
import { RecentTransactionsPanel } from "./RecentTransactionsPanel";
import { StatCardGrid, StatSkeleton } from "./StatCardGrid";

function allTime(): PeriodRange {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return {
    start: "2000-01-01",
    end: tomorrow.toISOString().slice(0, 10),
  };
}

interface DashboardAnalyticsProps {
  clientId?: string | null;
  showTotalClientsCard?: boolean;
  onOpenClients?: () => void;
  onOpenTransactions?: () => void;
  onOpenReports?: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

export function DashboardAnalytics({
  clientId,
  showTotalClientsCard = true,
  onOpenClients,
  onOpenTransactions,
  onOpenReports,
  emptyStateTitle,
  emptyStateDescription,
}: DashboardAnalyticsProps) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PeriodRange>(allTime);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard_stats", clientId ?? "none", period.start, period.end],
    queryFn: () =>
      getDashboardStats(
        period.start && period.end ? { start: period.start, end: period.end } : undefined,
        clientId ?? undefined,
      ),
    enabled: Boolean(clientId),
    retry: false,
  });

  const revenueCents = stats ? Math.round(parseFloat(stats.ytd_revenue) * 100) : 0;
  const expensesCents = stats ? Math.round(parseFloat(stats.ytd_expenses) * 100) : 0;
  const statValues = {
    total_clients: stats?.total_clients ?? 0,
    ytd_revenue: stats?.ytd_revenue ?? "0",
    ytd_expenses: stats?.ytd_expenses ?? "0",
    ytd_net_income: stats?.ytd_net_income ?? "0",
    total_transactions: stats?.total_transactions ?? 0,
    account_balances: stats?.account_balances ?? [],
    recent_transactions: stats?.recent_transactions ?? [],
  };

  const skeletonKeys = showTotalClientsCard
    ? ["clients", "revenue", "expenses", "net", "txns"]
    : ["revenue", "expenses", "net", "txns"];

  function handleNavigate(page: string) {
    switch (page) {
      case "clients":
        onOpenClients?.();
        return;
      case "reports":
        onOpenReports?.();
        return;
      case "ledger":
      case "transactions":
        onOpenTransactions?.();
        return;
      default:
        return;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {clientId && <PeriodPicker clientId={clientId} value={period} onChange={setPeriod} />}
          <button
            type="button"
            onClick={onOpenTransactions}
            disabled={!clientId}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {t("New Transaction")}
          </button>
          <button
            type="button"
            onClick={onOpenTransactions}
            disabled={!clientId}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {t("Import")}
          </button>
          <button
            type="button"
            onClick={onOpenReports}
            disabled={!clientId}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            {t("View Reports")}
          </button>
        </div>
      </div>

      {statsLoading ? (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${showTotalClientsCard ? "lg:grid-cols-5" : "xl:grid-cols-4"} gap-4`}
        >
          {skeletonKeys.map((key) => (
            <StatSkeleton key={key} />
          ))}
        </div>
      ) : (
        <StatCardGrid
          totalClients={statValues.total_clients}
          ytdRevenue={statValues.ytd_revenue}
          ytdExpenses={statValues.ytd_expenses}
          ytdNetIncome={statValues.ytd_net_income}
          totalTransactions={statValues.total_transactions}
          onNavigate={handleNavigate}
          showTotalClientsCard={showTotalClientsCard}
        />
      )}

      {clientId ? (
        <>
          <ChartsRow
            clientId={clientId}
            period={period}
            revenueCents={revenueCents}
            expensesCents={expensesCents}
            accountBalances={statValues.account_balances}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-4">
              <EstimatedQuarterlyTaxCard
                ytdNetIncome={statValues.ytd_net_income}
                onViewDeadlines={handleOpenTaxNews}
              />
              <DeductibleExpensesCard clientId={clientId} start={period.start} end={period.end} />
            </div>
            <div className="lg:col-span-2">
              <RecentTransactionsPanel
                transactions={statValues.recent_transactions}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Building2 className="w-6 h-6" />}
          title={emptyStateTitle ?? t("No dashboard business selected")}
          description={
            emptyStateDescription ??
            t("Create or match a client ledger for your main business to load dashboard analytics.")
          }
        />
      )}

    </div>
  );
}
