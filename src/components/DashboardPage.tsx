import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { getBusinessProfile } from "../lib/business-profile-api";
import { getDashboardStats } from "../lib/dashboard-api";
import { useI18n } from "../lib/i18n";
import type { PeriodRange } from "../lib/tauri";
import { Button } from "./ui/Button";

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

  const [period, setPeriod] = useState<PeriodRange>(allTime);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard_stats", "owner", period.start, period.end],
    queryFn: () =>
      getDashboardStats(
        period.start && period.end ? { start: period.start, end: period.end } : undefined,
        "owner",
      ),
    enabled: true,
    retry: false,
  });

  const { data: businessProfile } = useQuery({
    queryKey: ["business_profile", "owner"],
    queryFn: getBusinessProfile,
    enabled: true,
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

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("Dashboard")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("Your bookkeeping overview at a glance.")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodPicker clientId="owner" value={period} onChange={setPeriod} />
            <Button variant="secondary" size="md" onClick={() => onNavigate("transactions")}>
              <Plus className="w-4 h-4" />
              {t("New Transaction")}
            </Button>
            <Button variant="secondary" size="md" onClick={() => onNavigate("transactions")}>
              <Upload className="w-4 h-4" />
              {t("Import")}
            </Button>
            <Button variant="primary" size="md" onClick={() => onNavigate("reports")}>
              <FileText className="w-4 h-4" />
              {t("View Reports")}
            </Button>
          </div>
        </div>
      </div>

      {businessProfile && <BusinessProfileCard profile={businessProfile} onNavigate={onNavigate} />}

      <div className="flex-1 px-8 py-6 space-y-6">
        {statsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {["clients", "revenue", "expenses", "net", "txns"].map((k) => (
              <StatSkeleton key={k} />
            ))}
          </div>
        ) : (
          <StatCardGrid
            totalClients={statValues.total_clients}
            ytdRevenue={statValues.ytd_revenue}
            ytdExpenses={statValues.ytd_expenses}
            ytdNetIncome={statValues.ytd_net_income}
            totalTransactions={statValues.total_transactions}
            onNavigate={onNavigate}
          />
        )}

        {period.start && period.end && (
          <ChartsRow
            clientId="owner"
            period={period}
            revenueCents={revenueCents}
            expensesCents={expensesCents}
            accountBalances={statValues.account_balances}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <EstimatedQuarterlyTaxCard
              ytdNetIncome={statValues.ytd_net_income}
              onViewDeadlines={() => onNavigate("tax-news")}
            />
            {period.start && period.end && (
              <DeductibleExpensesCard clientId="owner" start={period.start} end={period.end} />
            )}
          </div>
          <div className="lg:col-span-2">
            <RecentTransactionsPanel
              transactions={statValues.recent_transactions}
              onNavigate={onNavigate}
            />
          </div>
        </div>

        <TaxNewsSection clientId="owner" onViewAll={() => onNavigate("tax-news")} />
      </div>
    </div>
  );
}
