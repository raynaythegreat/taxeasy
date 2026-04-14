import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, ChevronDown, Pencil } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { deleteTransaction, updateTransaction } from "../../lib/tauri";
import type { TransactionWithEntries } from "../../lib/tauri";
import { cn, formatCurrency, formatDate } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface LedgerViewProps {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  searchQuery?: string;
  onDeleteTxn: (id: string) => void;
  onEditTxn: () => void;
}

function LockIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-400"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Locked"
    >
      <path d="M11.5 6V5a3.5 3.5 0 0 0-7 0v1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1.5zM6 5a2 2 0 1 1 4 0v1H6V5z" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded" />
        </td>
      ))}
    </tr>
  );
}

function TxnRow({
  txn,
  onDelete,
  onEdit,
}: {
  txn: TransactionWithEntries;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(txn.txn_date);
  const [editDesc, setEditDesc] = useState(txn.description);
  const [editRef, setEditRef] = useState(txn.reference ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const { t } = useI18n();

  const accountNames = [
    ...new Set(txn.entries.map((e) => e.account_name ?? "Unknown")),
  ].join(", ");

  const totalDebit = txn.entries.reduce(
    (sum, e) => sum + (parseFloat(e.debit) || 0),
    0
  );
  const totalCredit = txn.entries.reduce(
    (sum, e) => sum + (parseFloat(e.credit) || 0),
    0
  );

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmPending(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmPending(false);
    setDeleting(true);
    try {
      await deleteTransaction(txn.id);
      onDelete(txn.id);
    } catch {
      setDeleting(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmPending(false);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDate(txn.txn_date);
    setEditDesc(txn.description);
    setEditRef(txn.reference ?? "");
    setEditError(null);
    setEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(false);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editDesc.trim() || !editDate) return;
    setSaving(true);
    setEditError(null);
    try {
      await updateTransaction({
        txnId: txn.id,
        txnDate: editDate,
        description: editDesc.trim(),
        reference: editRef.trim() || undefined,
      });
      onEdit();
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {editing ? (
        <>
          <tr className="border-b border-blue-200 bg-blue-50/60">
            <td className="px-2 py-2">
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500 bg-white"
              />
            </td>
            <td className="px-2 py-2">
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Description"
                className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500 bg-white"
              />
            </td>
            <td className="px-2 py-2">
              <input
                type="text"
                value={editRef}
                onChange={(e) => setEditRef(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Reference"
                className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500 bg-white"
              />
            </td>
            <td className="px-4 py-2 text-sm text-gray-400 max-w-[180px] truncate">
              {accountNames}
            </td>
            <td className="px-4 py-2 text-sm text-right text-gray-400 tabular-nums">
              {totalDebit > 0 ? formatCurrency(totalDebit) : "—"}
            </td>
            <td className="px-4 py-2 text-sm text-right text-gray-400 tabular-nums">
              {totalCredit > 0 ? formatCurrency(totalCredit) : "—"}
            </td>
            <td className="px-2 py-2 text-right">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving || !editDesc.trim() || !editDate}
                  className="px-2.5 py-0.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {saving ? t("Saving…") : t("Save")}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  {t("Cancel")}
                </button>
              </div>
            </td>
          </tr>
          {editError && (
            <tr className="bg-red-50 border-b border-red-100">
              <td colSpan={7} className="px-4 py-1.5 text-xs text-red-600">
                {editError}
              </td>
            </tr>
          )}
        </>
      ) : (
        <tr
          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">
            {formatDate(txn.txn_date)}
          </td>
          <td className="px-4 py-2.5 text-sm text-gray-900 max-w-[200px] truncate">
            {txn.description}
          </td>
          <td className="px-4 py-2.5 text-sm text-gray-500">
            {txn.reference ?? "—"}
          </td>
          <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[180px] truncate">
            {accountNames}
          </td>
          <td className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums">
            {totalDebit > 0 ? formatCurrency(totalDebit) : "—"}
          </td>
          <td className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums">
            {totalCredit > 0 ? formatCurrency(totalCredit) : "—"}
          </td>
          <td className="px-4 py-2.5 text-right">
            <div className="flex items-center justify-end gap-1">
              {confirmPending ? (
                <>
                  <span className="text-xs text-red-600 mr-1">{t("Delete?")}</span>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    {t("Yes")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    {t("No")}
                  </button>
                </>
              ) : txn.locked ? (
                <LockIcon />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    title={t("Edit transaction")}
                    className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    title={t("Delete transaction")}
                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-gray-400 transition-transform",
                  expanded && "rotate-180"
                )}
              />
            </div>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="bg-blue-50/50 border-b border-blue-100">
          <td colSpan={7} className="px-6 py-3 border-l-2 border-blue-400">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide">
                  <th className="text-left pb-1.5 font-medium">{t("Account")}</th>
                  <th className="text-right pb-1.5 font-medium pr-8">{t("Debit")}</th>
                  <th className="text-right pb-1.5 font-medium pr-8">{t("Credit")}</th>
                  <th className="text-left pb-1.5 font-medium">{t("Memo")}</th>
                </tr>
              </thead>
              <tbody>
                {txn.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-blue-100">
                    <td className="py-1 text-gray-700">
                      {entry.account_name ?? entry.account_id}
                    </td>
                    <td className="py-1 text-right pr-8 tabular-nums text-gray-700">
                      {parseFloat(entry.debit) > 0
                        ? formatCurrency(entry.debit)
                        : "—"}
                    </td>
                    <td className="py-1 text-right pr-8 tabular-nums text-gray-700">
                      {parseFloat(entry.credit) > 0
                        ? formatCurrency(entry.credit)
                        : "—"}
                    </td>
                    <td className="py-1 text-gray-500 italic">
                      {entry.memo ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export function LedgerView({ dateFrom, dateTo, accountId, searchQuery, onDeleteTxn, onEditTxn }: LedgerViewProps) {
  const { t } = useI18n();
  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ["transactions", dateFrom, dateTo, accountId, searchQuery],
    queryFn: () =>
      invoke<TransactionWithEntries[]>("list_transactions", {
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        accountId: accountId ?? null,
        search: searchQuery ?? null,
      }),
  });

  if (error) {
    return (
      <div className="px-4 py-8 text-center text-sm text-red-500">
        {t("Failed to load transactions. Please try again.")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
              {t("Date")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Description")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Reference")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("Accounts")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
              {t("Debit")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
              {t("Credit")}
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
              {t("Actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {!isLoading && (!transactions || transactions.length === 0) && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                {t("No transactions found")}
              </td>
            </tr>
          )}

          {!isLoading &&
            transactions?.map((txn) => (
              <TxnRow key={txn.id} txn={txn} onDelete={onDeleteTxn} onEdit={onEditTxn} />
            ))}
        </tbody>
        {!isLoading && transactions && transactions.length > 0 && (
          <tfoot>
            <tr>
              <td
                colSpan={7}
                className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100"
              >
                {t("Showing {count} transaction{s}", { count: String(transactions.length), s: transactions.length !== 1 ? "s" : "" })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
