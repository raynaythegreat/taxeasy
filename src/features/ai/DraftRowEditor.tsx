import { useState } from "react";
import { Pencil, Check, CheckCircle, XCircle, SkipForward } from "lucide-react";
import type { DraftTransaction } from "../../lib/ai-api";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

function formatAmount(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount / 100);
}

function statusClasses(status: string): string {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[status] ?? "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400";
}

export function DraftRowEditor({
  draft,
  accounts,
  onApprove,
  onReject,
  onUpdate,
}: {
  draft: DraftTransaction;
  accounts: any[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdate: (id: string, data: any) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    date: draft.date ?? "",
    description: draft.description ?? "",
    reference: draft.reference ?? "",
    debitAccountId: draft.debitAccountId ?? "",
    creditAccountId: draft.creditAccountId ?? "",
    amount: draft.amount !== null ? String(draft.amount / 100) : "",
    notes: draft.notes ?? "",
  });

  const isPending = draft.status === "pending";

  const handleSave = () => {
    const amountCents = form.amount ? Math.round(parseFloat(form.amount) * 100) : null;
    onUpdate(draft.id, {
      date: form.date || null,
      description: form.description || null,
      reference: form.reference || null,
      debitAccountId: form.debitAccountId || null,
      creditAccountId: form.creditAccountId || null,
      amount: amountCents,
      notes: form.notes || null,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setForm({
      date: draft.date ?? "",
      description: draft.description ?? "",
      reference: draft.reference ?? "",
      debitAccountId: draft.debitAccountId ?? "",
      creditAccountId: draft.creditAccountId ?? "",
      amount: draft.amount !== null ? String(draft.amount / 100) : "",
      notes: draft.notes ?? "",
    });
    setEditing(false);
  };

  const accountName = (id: string | null) => {
    if (!id) return "—";
    const acc = accounts.find((a: any) => a.id === id);
    return acc ? `${acc.code} — ${acc.name}` : id;
  };

  if (editing) {
    return (
      <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
              {t("ai.date")}
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
              {t("ai.amount")}
            </label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
            {t("ai.description")}
          </label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
            {t("ai.reference")}
          </label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
              {t("ai.debitAccount")}
            </label>
            <select
              value={form.debitAccountId}
              onChange={(e) => setForm((f) => ({ ...f, debitAccountId: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">—</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
              {t("ai.creditAccount")}
            </label>
            <select
              value={form.creditAccountId}
              onChange={(e) => setForm((f) => ({ ...f, creditAccountId: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">—</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-neutral-400 mb-0.5">
            {t("ai.notes")}
          </label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Check className="w-3 h-3" />
            {t("ai.save")}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-2.5 py-1 text-xs font-medium border border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-neutral-400 rounded hover:bg-gray-50 dark:hover:bg-neutral-800"
          >
            {t("ai.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-900 dark:text-neutral-100 truncate">
              {draft.description ?? "—"}
            </span>
            <span
              className={cn(
                "inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
                statusClasses(draft.status)
              )}
            >
              {t(`ai.${draft.status}`)}
            </span>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-gray-400 dark:text-neutral-500">{t("ai.date")}</span>
            <span className="text-gray-700 dark:text-neutral-300">{draft.date ?? "—"}</span>
            <span className="text-gray-400 dark:text-neutral-500">{t("ai.reference")}</span>
            <span className="text-gray-700 dark:text-neutral-300">{draft.reference ?? "—"}</span>
            <span className="text-gray-400 dark:text-neutral-500">{t("ai.debitAccount")}</span>
            <span className="text-gray-700 dark:text-neutral-300">
              {accountName(draft.debitAccountId)}
            </span>
            <span className="text-gray-400 dark:text-neutral-500">{t("ai.creditAccount")}</span>
            <span className="text-gray-700 dark:text-neutral-300">
              {accountName(draft.creditAccountId)}
            </span>
            <span className="text-gray-400 dark:text-neutral-500">{t("ai.amount")}</span>
            <span className="text-gray-900 dark:text-neutral-100 font-medium tabular-nums">
              {formatAmount(draft.amount)}
            </span>
            {draft.notes && (
              <>
                <span className="text-gray-400 dark:text-neutral-500">{t("ai.notes")}</span>
                <span className="text-gray-700 dark:text-neutral-300">{draft.notes}</span>
              </>
            )}
          </div>
        </div>
        {isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onApprove(draft.id)}
              className="p-1 rounded text-gray-400 dark:text-neutral-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
              title={t("ai.approve")}
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 rounded text-gray-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title={t("ai.edit")}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReject(draft.id)}
              className="p-1 rounded text-gray-400 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              title={t("ai.reject")}
            >
              <XCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 rounded text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-700"
              title={t("ai.skip")}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
