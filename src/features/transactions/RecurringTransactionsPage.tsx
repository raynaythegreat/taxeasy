import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import {
  deleteRecurring,
  listRecurring,
  type RecurringTransaction,
  updateRecurring,
} from "../../lib/recurring-api";
import type { Account } from "../../lib/tauri";
import { listAccounts } from "../../lib/tauri";
import { RecurringForm } from "./RecurringForm";

// ── Helpers ────────────────────────────────────────────────────────────────────

function cents(n: number): string {
  const abs = Math.abs(n);
  const formatted = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${formatted})` : formatted;
}

function FrequencyBadge({ f }: { f: string }) {
  const colors: Record<string, string> = {
    weekly: "bg-purple-50 text-purple-700",
    monthly: "bg-blue-50 text-blue-700",
    quarterly: "bg-indigo-50 text-indigo-700",
    yearly: "bg-teal-50 text-teal-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors[f] ?? "bg-gray-100 text-gray-600"}`}
    >
      {f}
    </span>
  );
}

// ── Row actions ────────────────────────────────────────────────────────────────

function RecurringRow({
  rec,
  accounts,
  onEdit,
  onToggle,
  onDelete,
}: {
  rec: RecurringTransaction;
  accounts: Account[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  // Map account IDs to names
  const accountMap = new Map(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
  const debitAccountName = accountMap.get(rec.debit_account_id) || "Unknown";
  const creditAccountName = accountMap.get(rec.credit_account_id) || "Unknown";

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-medium text-gray-800 hover:text-blue-600 text-left"
        >
          {rec.description}
        </button>
      </td>
      <td className="px-4 py-2.5 text-sm tabular-nums text-gray-700">{cents(rec.amount_cents)}</td>
      <td className="px-4 py-2.5">
        <FrequencyBadge f={rec.frequency} />
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{rec.next_run_date}</td>
      <td className="px-4 py-2.5 text-sm text-gray-600">{debitAccountName}</td>
      <td className="px-4 py-2.5 text-sm text-gray-600">{creditAccountName}</td>
      <td className="px-4 py-2.5">
        {rec.active ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            {t("Active")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
            {t("Paused")}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onToggle}
            title={rec.active ? t("Pause") : t("Resume")}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            {rec.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={t("Delete")}
            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecurringTransactionsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | undefined>(undefined);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["recurring"],
    queryFn: listRecurring,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(""),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateRecurring(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const handleEdit = (rec: RecurringTransaction) => {
    setEditing(rec);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditing(undefined);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(undefined);
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t("Delete this recurring schedule? Generated transactions are kept."))) {
      deleteMutation.mutate(id);
    }
  };

  if (showForm) {
    return (
      <RecurringForm
        existing={editing}
        onClose={() => {
          setShowForm(false);
          setEditing(undefined);
        }}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">{t("Recurring Transactions")}</h2>
          {items.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("New Recurring")}
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          {t("Loading…")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <Calendar className="w-10 h-10 text-gray-200" />
          <div>
            <p className="text-sm font-medium text-gray-600">{t("No recurring transactions")}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t("Schedule rent, subscriptions, or estimated tax payments.")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            {t("Add first recurring")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                  {t("Description")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">{t("Amount")}</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                  {t("Frequency")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">{t("Next Run")}</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                  {t("Debit Account")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                  {t("Credit Account")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-600">{t("Status")}</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((rec) => (
                <RecurringRow
                  key={rec.id}
                  rec={rec}
                  accounts={accounts}
                  onEdit={() => handleEdit(rec)}
                  onToggle={() => toggleMutation.mutate({ id: rec.id, active: !rec.active })}
                  onDelete={() => handleDelete(rec.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
