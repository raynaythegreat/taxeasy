import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { getBusinessProfile } from "../lib/business-profile-api";
import { getDashboardStats } from "../lib/dashboard-api";
import { useI18n } from "../lib/i18n";
import { getActiveClientId, type PeriodRange } from "../lib/tauri";

/** "All time" as a half-open [start, end) range. Used as the dashboard's
 *  default so every user sees their actual data on first paint, regardless
 *  of when transactions were entered. Users pick a narrower period from
 *  the PeriodPicker when they want YTD / quarter / tax-year specifics. */
function allTime(): PeriodRange {
  const now = new Date();
  // end is half-open: first day AFTER today, so today's txns are included.
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    start: "2000-01-01", // far enough back to cover any bookkeeping history
    end: tomorrow.toISOString().slice(0, 10),
  };
}

import { BusinessProfileCard } from "./dashboard/BusinessProfileCard";
import { ChartsRow } from "./dashboard/ChartsRow";
import { DeductibleExpensesCard } from "./dashboard/DeductibleExpensesCard";
import { EstimatedQuarterlyTaxCard } from "./dashboard/EstimatedQuarterlyTaxCard";
import { RecentTransactionsPanel } from "./dashboard/RecentTransactionsPanel";
import { StatCardGrid, StatSkeleton } from "./dashboard/StatCardGrid";
import { TaxNewsSection } from "./dashboard/TaxNewsSection";
import { PeriodPicker } from "./PeriodPicker";

interface DashboardPageProps {
  onSelectClient: (clientId: string) => void;
  onNewClient: () => void;
  onNavigate?: (page: string) => void;
}

export function DashboardPage({
  onSelectClient: _onSelectClient,
  onNewClient: _onNewClient,
  onNavigate: _onNavigate,
}: DashboardPageProps) {
  const { t } = useI18n();
  const onNavigate = _onNavigate ?? (() => {});

  // Default to "All Time" so the user's actual data shows on first paint.
  // Users pick narrower periods (YTD / quarter / tax-year) from PeriodPicker.
  const [period, setPeriod] = useState<PeriodRange>(allTime);

  const { data: clientId } = useQuery({
    queryKey: ["active_client_id"],
    queryFn: getActiveClientId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard_stats", period.start, period.end],
    queryFn: () =>
      getDashboardStats(
        period.start && period.end ? { start: period.start, end: period.end } : undefined,
      ),
    retry: false,
  });

  const { data: businessProfile } = useQuery({
    queryKey: ["business_profile"],
    queryFn: getBusinessProfile,
    retry: false,
  });

  const revenueCents = stats ? Math.round(parseFloat(stats.ytd_revenue) * 100) : 0;
  const expensesCents = stats ? Math.round(parseFloat(stats.ytd_expenses) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("Dashboard")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("Your bookkeeping overview at a glance.")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {clientId && <PeriodPicker clientId={clientId} value={period} onChange={setPeriod} />}
            <button
              type="button"
              onClick={() => onNavigate("transactions")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("New Transaction")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("transactions")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {t("Import")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("reports")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {t("View Reports")}
            </button>
          </div>
        </div>
      </div>

      {/* Business profile banner */}
      {businessProfile && <BusinessProfileCard profile={businessProfile} onNavigate={onNavigate} />}

      {/* Main content */}
      <div className="flex-1 px-8 py-6 space-y-6">
        {/* Stat cards */}
        {statsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {["clients", "revenue", "expenses", "net", "txns"].map((k) => (
              <StatSkeleton key={k} />
            ))}
          </div>
        ) : stats ? (
          <StatCardGrid
            totalClients={stats.total_clients}
            ytdRevenue={stats.ytd_revenue}
            ytdExpenses={stats.ytd_expenses}
            ytdNetIncome={stats.ytd_net_income}
            totalTransactions={stats.total_transactions}
            onNavigate={onNavigate}
          />
        ) : null}

        {/* Charts row */}
        {stats && period.start && period.end && (
          <ChartsRow
            period={period}
            revenueCents={revenueCents}
            expensesCents={expensesCents}
            accountBalances={stats.account_balances}
          />
        )}

        {/* Tax widgets + recent transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            {stats && (
              <EstimatedQuarterlyTaxCard
                ytdNetIncome={stats.ytd_net_income}
                onViewDeadlines={() => onNavigate("tax-news")}
              />
            )}
            {period.start && period.end && (
              <DeductibleExpensesCard start={period.start} end={period.end} />
            )}
          </div>
          <div className="lg:col-span-2">
            <RecentTransactionsPanel
              transactions={stats?.recent_transactions ?? []}
              onNavigate={onNavigate}
            />
          </div>
        </div>

        {/* Tax news */}
        <TaxNewsSection clientId={clientId ?? undefined} onViewAll={() => onNavigate("tax-news")} />
      </div>
    </div>
  );
}
