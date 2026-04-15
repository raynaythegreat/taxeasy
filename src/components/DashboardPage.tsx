import { useQuery } from "@tanstack/react-query";
import {
  Users,
  TrendingUp,
  DollarSign,
  Upload,
  FileText,
  Plus,
  Scale,
  ExternalLink,
  Building2,
} from "lucide-react";
import { listClients } from "../lib/tauri";
import type { EntityType } from "../lib/tauri";
import { getDashboardStats } from "../lib/dashboard-api";
import { getBusinessProfile } from "../lib/business-profile-api";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n";

const ENTITY_COLORS: Record<EntityType, string> = {
  sole_prop: "bg-blue-50 text-blue-700",
  smllc: "bg-purple-50 text-purple-700",
  scorp: "bg-green-50 text-green-700",
  ccorp: "bg-amber-50 text-amber-700",
  partnership: "bg-teal-50 text-teal-700",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-red-50 text-red-700 border-red-200",
  equity: "bg-purple-50 text-purple-700 border-purple-200",
  revenue: "bg-green-50 text-green-700 border-green-200",
  expense: "bg-amber-50 text-amber-700 border-amber-200",
};

interface DashboardPageProps {
  onSelectClient: (clientId: string) => void;
  onNewClient: () => void;
  onNavigate?: (page: string) => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-4 bg-gray-100 rounded w-1/3" />
    </div>
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

function fmtMoney(val: string) {
  return parseFloat(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DashboardPage({ onSelectClient, onNewClient, onNavigate: _onNavigate }: DashboardPageProps) {
  const { t } = useI18n();
  const onNavigate = _onNavigate ?? (() => {});

  const ENTITY_LABELS: Record<EntityType, string> = {
    sole_prop: t("Sole Proprietor"),
    smllc: t("SMLLC"),
    scorp: t("S-Corp"),
    ccorp: t("C-Corp"),
    partnership: t("Partnership"),
  };

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    asset: t("Assets"),
    liability: t("Liabilities"),
    equity: t("Equity"),
    revenue: t("Revenue"),
    expense: t("Expenses"),
  };
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: getDashboardStats,
    retry: false,
  });

  const { data: businessProfile } = useQuery({
    queryKey: ["business_profile"],
    queryFn: getBusinessProfile,
    retry: false,
  });

  const activeClients = clients.filter((c) => !c.archived_at);

  const netIncomeNum = stats ? parseFloat(stats.ytd_net_income) : 0;

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("Dashboard")}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t("Your bookkeeping overview at a glance.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("transactions")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("New Transaction")}
            </button>
            <button
              onClick={() => onNavigate("transactions")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {t("Import")}
            </button>
            <button
              onClick={() => onNavigate("reports")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {t("View Reports")}
            </button>
          </div>
        </div>
      </div>

      {businessProfile && (
        <div className="bg-white border-b border-gray-200 px-8 py-5">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{businessProfile.name}</h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {ENTITY_LABELS[businessProfile.entity_type as EntityType] || businessProfile.entity_type}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {businessProfile.accounting_method} {t("basis")}
                    </span>
                    {businessProfile.ein && (
                      <span className="text-xs text-gray-500">{t("EIN")}: {businessProfile.ein}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("settings")}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t("Edit Profile")}
                </button>
              </div>
              <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
                {businessProfile.contact_name && (
                  <span>{businessProfile.contact_name}</span>
                )}
                {businessProfile.email && (
                  <span>{businessProfile.email}</span>
                )}
                {businessProfile.phone && (
                  <span>{businessProfile.phone}</span>
                )}
              </div>
              {(businessProfile.address_line1 || businessProfile.city) && (
                <div className="mt-2 text-sm text-gray-500">
                  {[businessProfile.address_line1, businessProfile.address_line2, businessProfile.city, businessProfile.state, businessProfile.postal_code].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {statsLoading ? (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          ) : (
            <>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                      {t("Total Clients")}
                    </p>
                    <p className="text-2xl font-bold text-purple-700">
                      {stats?.total_clients ?? activeClients.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                      {t("YTD Revenue")}
                    </p>
                    <p className="text-2xl font-bold text-green-700">
                      ${stats ? fmtMoney(stats.ytd_revenue) : "0.00"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Scale className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                      {t("Tax Law News")}
                    </p>
                    <p className="text-sm font-medium text-indigo-700 mt-0.5">
                      {new Date().getFullYear()} {t("Tax Season")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-indigo-700 py-1 border-b border-indigo-100">
                    <span className="font-medium">April 15, {new Date().getFullYear()}</span> - Tax Filing Deadline
                  </div>
                  <div className="text-xs text-indigo-700 py-1 border-b border-indigo-100">
                    <span className="font-medium">Oct 15, {new Date().getFullYear()}</span> - Extended Filing Deadline
                  </div>
                  <a
                    href="https://www.irs.gov/newsroom"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {t("IRS Newsroom")} - Latest Updates
                  </a>
                  <a
                    href="https://www.irs.gov/tax-professionals/priority-guidance-plan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    2026-2027 Priority Guidance Plan
                  </a>
                  <a
                    href="https://www.irs.gov/irs-tax-pros/2026-tax-forum"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    2026 Nationwide Tax Forum
                  </a>
                </div>
              </div>

              <div
                className={cn(
                  "border rounded-xl p-5",
                  netIncomeNum >= 0
                    ? "bg-blue-50 border-blue-200"
                    : "bg-red-50 border-red-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      netIncomeNum >= 0
                        ? "bg-blue-100"
                        : "bg-red-100"
                    )}
                  >
                    <DollarSign
                      className={cn(
                        "w-5 h-5",
                        netIncomeNum >= 0 ? "text-blue-600" : "text-red-600"
                      )}
                    />
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        netIncomeNum >= 0
                          ? "text-blue-600"
                          : "text-red-600"
                      )}
                    >
                      {t("Net Income")}
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-bold",
                        netIncomeNum >= 0
                          ? "text-blue-700"
                          : "text-red-700"
                      )}
                    >
                      ${stats ? fmtMoney(stats.ytd_net_income) : "0.00"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {!statsLoading && stats?.account_balances && stats.account_balances.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t("Account Balances")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.account_balances.map((ab) => (
                <div
                  key={ab.account_type}
                  className={cn(
                    "border rounded-lg p-4",
                    ACCOUNT_TYPE_COLORS[ab.account_type] ??
                      "bg-gray-50 text-gray-700 border-gray-200"
                  )}
                >
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">
                    {ACCOUNT_TYPE_LABELS[ab.account_type] ?? ab.account_type}
                  </p>
                  <p className="text-lg font-bold mt-1 tabular-nums">
                    ${fmtMoney(ab.balance)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Clients")}
            </h2>
            <button
              onClick={onNewClient}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("New Client")}
            </button>
          </div>

          {clientsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {!clientsLoading && activeClients.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-gray-200 rounded-xl">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">{t("No clients yet")}</p>
              <p className="text-gray-400 text-sm mt-1">
                {t("Add your first client to get started.")}
              </p>
              <button
                onClick={onNewClient}
                className="mt-5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("Add First Client")}
              </button>
            </div>
          )}

          {!clientsLoading && activeClients.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                      {client.name}
                    </h3>
                    <svg
                      className="w-4 h-4 text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        ENTITY_COLORS[client.entity_type]
                      )}
                    >
                      {ENTITY_LABELS[client.entity_type]}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {client.accounting_method} {t("basis")}
                    </span>
                  </div>
                  {client.ein && (
                    <p className="mt-2 text-xs text-gray-400">{t("EIN")}: {client.ein}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
