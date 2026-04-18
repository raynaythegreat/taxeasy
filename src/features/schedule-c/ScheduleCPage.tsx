import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  type ScheduleCMapping,
  type UpsertMappingPayload,
  calculateScheduleCSummary,
  deleteScheduleCMapping,
  listScheduleCMappings,
  upsertScheduleCMapping,
} from "../../lib/schedule-c-api";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

const SCHEDULE_C_LINES: { value: string; label: string; category: string }[] = [
  // Income
  { value: "line_1", label: "Line 1: Gross receipts or sales", category: "income" },
  { value: "line_2", label: "Line 2: Returns and allowances", category: "income" },
  { value: "line_4", label: "Line 4: Cost of goods sold", category: "income" },
  { value: "line_6", label: "Line 6: Other income", category: "income" },
  // Expenses
  { value: "line_8", label: "Line 8: Advertising", category: "expense" },
  { value: "line_9", label: "Line 9: Car and truck expenses", category: "expense" },
  { value: "line_10", label: "Line 10: Commissions and fees", category: "expense" },
  { value: "line_11", label: "Line 11: Contract labor", category: "expense" },
  { value: "line_12", label: "Line 12: Depletion", category: "expense" },
  { value: "line_13", label: "Line 13: Depreciation", category: "expense" },
  { value: "line_14", label: "Line 14: Employee benefit programs", category: "expense" },
  { value: "line_15", label: "Line 15: Insurance (other than health)", category: "expense" },
  { value: "line_16", label: "Line 16: Interest (mortgage)", category: "expense" },
  { value: "line_17", label: "Line 17: Interest (other)", category: "expense" },
  { value: "line_18", label: "Line 18: Legal and professional services", category: "expense" },
  { value: "line_19", label: "Line 19: Office expense", category: "expense" },
  { value: "line_20", label: "Line 20: Pension and profit-sharing", category: "expense" },
  { value: "line_21", label: "Line 21: Rent or lease (other)", category: "expense" },
  { value: "line_22", label: "Line 22: Repairs and maintenance", category: "expense" },
  { value: "line_23", label: "Line 23: Supplies and materials", category: "expense" },
  { value: "line_24a", label: "Line 24a: Taxes and licenses", category: "expense" },
  { value: "line_24b", label: "Line 24b: Meals (50% limit)", category: "expense" },
  { value: "line_25", label: "Line 25: Utilities", category: "expense" },
  { value: "line_26", label: "Line 26: Wages (less credits)", category: "expense" },
  { value: "line_27a", label: "Line 27a: Other expenses", category: "expense" },
  { value: "line_27b", label: "Line 27b: Other expenses", category: "expense" },
  { value: "line_27c", label: "Line 27c: Other expenses", category: "expense" },
  { value: "line_27d", label: "Line 27d: Other expenses", category: "expense" },
  { value: "line_27e", label: "Line 27e: Other expenses", category: "expense" },
  { value: "line_27f", label: "Line 27f: Other expenses", category: "expense" },
];

export function ScheduleCPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [editingMapping, setEditingMapping] = useState<ScheduleCMapping | null>(null);

  const { data: mappings, isLoading } = useQuery({
    queryKey: ["schedule-c-mappings"],
    queryFn: listScheduleCMappings,
  });

  const { data: summary } = useQuery({
    queryKey: ["schedule-c-summary", selectedYear],
    queryFn: () => calculateScheduleCSummary(selectedYear),
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: UpsertMappingPayload) => upsertScheduleCMapping(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-c-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["schedule-c-summary"] });
      setEditingMapping(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mappingId: string) => deleteScheduleCMapping(mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-c-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["schedule-c-summary"] });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const groupedMappings = mappings?.reduce((acc, mapping) => {
    const lineInfo = SCHEDULE_C_LINES.find((l) => l.value === mapping.schedule_c_line);
    const category = lineInfo?.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(mapping);
    return acc;
  }, {} as Record<string, ScheduleCMapping[]>);

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
              <h1 className="text-lg font-semibold text-gray-900">{t("Schedule C Mappings")}</h1>
              <p className="text-sm text-gray-500">
                {t("Map chart of accounts to Schedule C lines")}
              </p>
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
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{t("Gross Receipts")}</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(summary.gross_receipts)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{t("Gross Profit")}</p>
            <p className="text-2xl font-semibold text-blue-600">
              {formatCurrency(summary.gross_profit)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{t("Total Expenses")}</p>
            <p className="text-2xl font-semibold text-orange-600">
              {formatCurrency(summary.total_expenses)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{t("Net Profit")}</p>
            <p className="text-2xl font-semibold text-green-600">
              {formatCurrency(summary.tentative_profit)}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        {editingMapping ? (
          <MappingForm
            mapping={editingMapping}
            onSubmit={(payload) => upsertMutation.mutate(payload)}
            onCancel={() => setEditingMapping(null)}
            isSubmitting={upsertMutation.isPending}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-gray-500">{t("Loading mappings...")}</div>
          </div>
        ) : !mappings || mappings.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            title={t("No Schedule C mappings yet")}
            description={t("Start by mapping accounts to Schedule C lines.")}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMappings || {}).map(([category, categoryMappings]) => (
              <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 capitalize">
                    {category === "income" ? t("Income") : t("Expenses")}
                  </h3>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        {t("Account")}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        {t("Schedule C Line")}
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        {t("Type")}
                      </th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categoryMappings.map((mapping) => (
                      <tr key={mapping.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{mapping.account_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {SCHEDULE_C_LINES.find((l) => l.value === mapping.schedule_c_line)?.label || mapping.schedule_c_line}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            mapping.account_type === "income" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                          )}>
                            {mapping.account_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingMapping(mapping)}
                            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 mr-1"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(mapping.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MappingForm({
  mapping,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  mapping: ScheduleCMapping | null;
  onSubmit: (payload: UpsertMappingPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<UpsertMappingPayload>({
    account_id: mapping?.account_id || "",
    schedule_c_line: mapping?.schedule_c_line || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.account_id || !payload.schedule_c_line) return;
    onSubmit(payload);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {mapping ? t("Edit Mapping") : t("New Mapping")}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("Schedule C Line")}
          </label>
          <select
            value={payload.schedule_c_line}
            onChange={(e) => setPayload({ ...payload, schedule_c_line: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">{t("Select a line...")}</option>
            {SCHEDULE_C_LINES.map((line) => (
              <option key={line.value} value={line.value}>
                {line.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
          >
            {isSubmitting ? t("Saving...") : t("Save Mapping")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
