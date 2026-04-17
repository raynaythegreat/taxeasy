import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import {
  type CreateRecurringPayload,
  type RecurringFrequency,
  type RecurringTransaction,
  type UpdateRecurringPatch,
  createRecurring,
  updateRecurring,
} from "../../lib/recurring-api";
import { listAccounts } from "../../lib/tauri";
import type { Account, AccountType } from "../../lib/tauri";
import { today } from "../../lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function AccountSelect({
  value,
  accounts,
  onChange,
  id,
}: {
  value: string;
  accounts: Account[];
  onChange: (id: string) => void;
  id?: string;
}) {
  const { t } = useI18n();
  const grouped = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    const items = accounts.filter((a) => a.account_type === type);
    if (items.length) acc[type] = items;
    return acc;
  }, {});
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
    >
      <option value="">{t("— select account —")}</option>
      {Object.entries(grouped).map(([type, items]) => (
        <optgroup key={type} label={t(TYPE_LABELS[type as AccountType])}>
          {items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  description: string;
  amountDollars: string; // dollar string e.g. "1234.56"
  debitAccountId: string;
  creditAccountId: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate: string;
}

function initForm(existing?: RecurringTransaction): FormState {
  if (existing) {
    return {
      description: existing.description,
      amountDollars: (existing.amount_cents / 100).toFixed(2),
      debitAccountId: existing.debit_account_id,
      creditAccountId: existing.credit_account_id,
      frequency: existing.frequency as RecurringFrequency,
      startDate: existing.start_date,
      endDate: existing.end_date ?? "",
    };
  }
  return {
    description: "",
    amountDollars: "",
    debitAccountId: "",
    creditAccountId: "",
    frequency: "monthly",
    startDate: today(),
    endDate: "",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface RecurringFormProps {
  clientId?: string;
  existing?: RecurringTransaction;
  onClose: () => void;
  onSaved: () => void;
}

export function RecurringForm({ clientId, existing, onClose, onSaved }: RecurringFormProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initForm(existing));
  const [formError, setFormError] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", clientId],
    queryFn: () => listAccounts(clientId ?? ""),
    enabled: !!clientId,
  });

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const createMutation = useMutation({
    mutationFn: (payload: CreateRecurringPayload) => createRecurring(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      onSaved();
    },
    onError: (e: unknown) => setFormError(e instanceof Error ? e.message : String(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateRecurringPatch }) =>
      updateRecurring(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      onSaved();
    },
    onError: (e: unknown) => setFormError(e instanceof Error ? e.message : String(e)),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.description.trim()) {
      setFormError(t("Description is required."));
      return;
    }
    const dollars = Number(form.amountDollars);
    if (!form.amountDollars || Number.isNaN(dollars) || dollars <= 0) {
      setFormError(t("Enter a positive amount."));
      return;
    }
    if (!form.debitAccountId || !form.creditAccountId) {
      setFormError(t("Both debit and credit accounts are required."));
      return;
    }

    const amountCents = Math.round(dollars * 100);

    if (existing) {
      updateMutation.mutate({
        id: existing.id,
        patch: {
          description: form.description.trim(),
          amount_cents: amountCents,
          debit_account_id: form.debitAccountId,
          credit_account_id: form.creditAccountId,
          frequency: form.frequency,
          end_date: form.endDate || undefined,
        },
      });
    } else {
      createMutation.mutate({
        description: form.description.trim(),
        amount_cents: amountCents,
        debit_account_id: form.debitAccountId,
        credit_account_id: form.creditAccountId,
        frequency: form.frequency,
        start_date: form.startDate,
        end_date: form.endDate || undefined,
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">
          {existing ? t("Edit Recurring Transaction") : t("New Recurring Transaction")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-4">
        {/* Description */}
        <div>
          <label htmlFor="rec-desc" className="block text-xs font-medium text-gray-700 mb-1">
            {t("Description")} <span className="text-red-500">*</span>
          </label>
          <input
            id="rec-desc"
            type="text"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder={t("e.g. Monthly rent, AWS subscription")}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="rec-amount" className="block text-xs font-medium text-gray-700 mb-1">
            {t("Amount ($)")} <span className="text-red-500">*</span>
          </label>
          <input
            id="rec-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amountDollars}
            onChange={(e) => set({ amountDollars: e.target.value })}
            placeholder="0.00"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 tabular-nums"
          />
        </div>

        {/* Frequency */}
        <div>
          <label htmlFor="rec-freq" className="block text-xs font-medium text-gray-700 mb-1">
            {t("Frequency")} <span className="text-red-500">*</span>
          </label>
          <select
            id="rec-freq"
            value={form.frequency}
            onChange={(e) => set({ frequency: e.target.value as RecurringFrequency })}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
          >
            {FREQUENCY_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </div>

        {/* Debit account */}
        <div>
          <label htmlFor="rec-debit" className="block text-xs font-medium text-gray-700 mb-1">
            {t("Debit Account")} <span className="text-red-500">*</span>
          </label>
          <AccountSelect
            id="rec-debit"
            value={form.debitAccountId}
            accounts={accounts}
            onChange={(id) => set({ debitAccountId: id })}
          />
        </div>

        {/* Credit account */}
        <div>
          <label htmlFor="rec-credit" className="block text-xs font-medium text-gray-700 mb-1">
            {t("Credit Account")} <span className="text-red-500">*</span>
          </label>
          <AccountSelect
            id="rec-credit"
            value={form.creditAccountId}
            accounts={accounts}
            onChange={(id) => set({ creditAccountId: id })}
          />
        </div>

        {/* Start date */}
        {!existing && (
          <div>
            <label htmlFor="rec-start" className="block text-xs font-medium text-gray-700 mb-1">
              {t("Start Date")} <span className="text-red-500">*</span>
            </label>
            <input
              id="rec-start"
              type="date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* End date (optional) */}
        <div>
          <label htmlFor="rec-end" className="block text-xs font-medium text-gray-700 mb-1">
            {t("End Date")}{" "}
            <span className="text-gray-400 font-normal text-xs">({t("optional")})</span>
          </label>
          <input
            id="rec-end"
            type="date"
            value={form.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        {formError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-auto pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {isPending ? t("Saving…") : existing ? t("Save Changes") : t("Create")}
          </button>
        </div>
      </form>
    </div>
  );
}
