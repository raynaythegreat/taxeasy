import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import { getActiveClientId } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import {
  type CreateMileagePayload,
  type MileageLog,
  createMileageLog,
  deleteMileageLog,
  getIrsMileageRate,
  getMileageDeductionTotal,
  listMileageLogs,
} from "../../lib/mileage-api";
import { EmptyState } from "../../components/ui/EmptyState";

export function MileagePage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);

  const clientId = getActiveClientId();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["mileage-logs", clientId, selectedYear],
    queryFn: () => listMileageLogs(clientId!, selectedYear),
    enabled: !!clientId,
  });

  const { data: currentRate } = useQuery({
    queryKey: ["irs-mileage-rate", selectedYear],
    queryFn: () => getIrsMileageRate(selectedYear),
  });

  const { data: totalDeduction } = useQuery({
    queryKey: ["mileage-deduction-total", clientId, selectedYear],
    queryFn: () => getMileageDeductionTotal(clientId!, selectedYear),
    enabled: !!clientId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateMileagePayload) => createMileageLog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-logs"] });
      queryClient.invalidateQueries({ queryKey: ["mileage-deduction-total"] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (logId: string) => deleteMileageLog(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-logs"] });
      queryClient.invalidateQueries({ queryKey: ["mileage-deduction-total"] });
    },
  });

  const formatDeduction = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const formatRate = (cents: number) => {
    return `${(cents / 100).toFixed(1)}¢/mile`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label={t("Back")}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{t("Mileage Tracker")}</h1>
              <p className="text-sm text-gray-500">{t("Track business mileage with IRS rates")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[2023, 2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              {t("Add Mileage")}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t("IRS Rate")}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {currentRate ? formatRate(currentRate.rate_cents) : "--"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t("Total Miles")}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {logs ? logs.reduce((sum, log) => sum + log.miles_real, 0).toFixed(1) : "--"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">{t("Total Deduction")}</p>
          <p className="text-2xl font-semibold text-green-600">
            {totalDeduction ? formatDeduction(totalDeduction) : "--"}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        {showForm ? (
          <MileageLogForm
            rate={currentRate?.rate_cents}
            onSubmit={(payload) => createMutation.mutate(payload)}
            onCancel={() => setShowForm(false)}
            isSubmitting={createMutation.isPending}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-gray-500">{t("Loading mileage logs...")}</div>
          </div>
        ) : logs && logs.length === 0 ? (
          <EmptyState
            icon={
              <svg
                className="w-12 h-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            }
            title={t("No mileage logs yet")}
            description={t("Add your first business mileage trip to get started.")}
            action={{ label: t("Add Mileage"), onClick: () => setShowForm(true) }}
          />
        ) : (
          <MileageLogTable
            logs={logs || []}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      </div>
    </div>
  );
}

function MileageLogForm({
  rate,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  rate?: number;
  onSubmit: (payload: CreateMileagePayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<CreateMileagePayload>({
    date: new Date().toISOString().split("T")[0],
    purpose: "",
    origin: "",
    destination: "",
    miles_real: 0,
    notes: "",
  });

  const deduction = rate ? (payload.miles_real * rate) / 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.purpose || !payload.origin || !payload.destination) return;
    onSubmit(payload);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("Add Mileage Log")}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("Date")}</label>
          <input
            type="date"
            value={payload.date}
            onChange={(e) => setPayload({ ...payload, date: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("Purpose")}</label>
          <input
            type="text"
            value={payload.purpose}
            onChange={(e) => setPayload({ ...payload, purpose: e.target.value })}
            placeholder={t("Client meeting, supply run, etc.")}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Origin")}</label>
            <input
              type="text"
              value={payload.origin}
              onChange={(e) => setPayload({ ...payload, origin: e.target.value })}
              placeholder={t("Starting location")}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("Destination")}
            </label>
            <input
              type="text"
              value={payload.destination}
              onChange={(e) => setPayload({ ...payload, destination: e.target.value })}
              placeholder={t("Ending location")}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("Miles")}</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={payload.miles_real}
            onChange={(e) => setPayload({ ...payload, miles_real: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          {rate && (
            <p className="mt-1 text-sm text-green-600">
              {t("At")} {formatRate(rate)} = <strong>{formatCurrency(deduction)}</strong> {t(
                "deduction",
              )}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("Notes")}</label>
          <textarea
            value={payload.notes}
            onChange={(e) => setPayload({ ...payload, notes: e.target.value })}
            placeholder={t("Optional notes...")}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700",
              isSubmitting && "opacity-50 cursor-not-allowed",
            )}
          >
            {isSubmitting ? t("Saving...") : t("Save Mileage Log")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50",
              isSubmitting && "opacity-50 cursor-not-allowed",
            )}
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function MileageLogTable({
  logs,
  onDelete,
}: {
  logs: MileageLog[];
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();

  const formatDeduction = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("Date")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("Purpose")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("Route")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
              {t("Miles")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
              {t("Rate")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
              {t("Deduction")}
            </th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">{log.date}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{log.purpose}</td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {log.origin} → {log.destination}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                {log.miles_real.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 text-right">
                {(log.rate_cents / 100).toFixed(1)}¢
              </td>
              <td className="px-4 py-3 text-sm text-green-600 text-right font-medium">
                {formatDeduction(log.deduction_cents)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(log.id)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title={t("Delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRate(cents: number): string {
  return `${(cents / 100).toFixed(1)}¢/mile`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
