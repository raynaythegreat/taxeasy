import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpDown, ChevronDown, Pencil, Plus, Receipt, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../lib/i18n";
import type { EntryPayload, TransactionWithEntries } from "../../lib/tauri";
import { deleteTransaction, listAccounts, updateTransaction } from "../../lib/tauri";
import { cn, formatCurrency, formatDate } from "../../lib/utils";
import { AccountSelect } from "./form/AccountSelect";

interface LedgerViewProps {
  clientId: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  searchQuery?: string;
  onDeleteTxn: (id: string) => void;
  onEditTxn: () => void;
}

type SortKey = "date" | "description" | "reference" | "accounts" | "amount";
type SortDirection = "asc" | "desc";

function getTransactionAccountNames(txn: TransactionWithEntries) {
  return [...new Set(txn.entries.map((e) => e.account_name ?? "Unknown"))].join(", ");
}

function getTransactionDisplayAmount(txn: TransactionWithEntries) {
  const totalDebit = txn.entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCredit = txn.entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  const hasExpenseDebit = txn.entries.some(
    (e) => parseFloat(e.debit) > 0 && e.account_type === "expense",
  );
  const isIncomeCredit = txn.entries.some(
    (e) => parseFloat(e.credit) > 0 && e.account_type === "revenue",
  );

  if (hasExpenseDebit) return -totalDebit;
  if (isIncomeCredit) return totalCredit;
  return totalDebit;
}

interface EditEntryData {
  id: string;
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
}

function initEditEntries(txn: TransactionWithEntries): EditEntryData[] {
  return txn.entries.map((e) => ({
    id: e.id,
    account_id: e.account_id,
    debit: parseFloat(e.debit) > 0 ? e.debit : "",
    credit: parseFloat(e.credit) > 0 ? e.credit : "",
    memo: e.memo ?? "",
  }));
}

function entriesAreBalanced(entries: EditEntryData[]): boolean {
  const totalDebit = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.005;
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
      {[...Array(6)].map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton columns, no stable ID
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded" />
        </td>
      ))}
    </tr>
  );
}

function TxnRow({
  txn,
  clientId,
  onDelete,
  onEdit,
}: {
  txn: TransactionWithEntries;
  clientId: string;
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
  const [editEntries, setEditEntries] = useState<EditEntryData[]>(() => initEditEntries(txn));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const { t } = useI18n();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", clientId],
    queryFn: () => listAccounts(clientId),
  });

  const accountNames = getTransactionAccountNames(txn);

  const totalDebit = txn.entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCredit = txn.entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);

  const hasExpenseDebit = txn.entries.some(
    (e) => parseFloat(e.debit) > 0 && e.account_type === "expense",
  );
  const isIncomeCredit = txn.entries.some(
    (e) => parseFloat(e.credit) > 0 && e.account_type === "revenue",
  );
  const isTransfer = !hasExpenseDebit && !isIncomeCredit;

  let displayAmount: number;
  let amountLabel: string;
  if (hasExpenseDebit) {
    displayAmount = -totalDebit;
    amountLabel = "expense";
  } else if (isIncomeCredit) {
    displayAmount = totalCredit;
    amountLabel = "income";
  } else {
    displayAmount = totalDebit;
    amountLabel = isTransfer ? "transfer" : "other";
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmPending(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmPending(false);
    setDeleting(true);
    try {
      await deleteTransaction(txn.id, clientId);
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
    setEditEntries(initEditEntries(txn));
    setEditError(null);
    setEditing(true);
    setExpanded(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(false);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editDesc.trim() || !editDate) return;
    if (!entriesAreBalanced(editEntries)) {
      setEditError(t("Entries must balance (total debits = total credits)"));
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const entryPayloads: EntryPayload[] = editEntries.map((ee) => ({
        account_id: ee.account_id,
        debit: ee.debit || undefined,
        credit: ee.credit || undefined,
        memo: ee.memo || undefined,
      }));
      await updateTransaction(
        {
          txnId: txn.id,
          txnDate: editDate,
          description: editDesc.trim(),
          reference: editRef.trim() || undefined,
          entries: entryPayloads,
        },
        clientId,
      );
      onEdit();
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = (idx: number, field: keyof EditEntryData, value: string) => {
    setEditEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (idx: number) => {
    setEditEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEntry = () => {
    setEditEntries((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, account_id: "", debit: "", credit: "", memo: "" },
    ]);
  };

  const editTotalDebit = editEntries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const editTotalCredit = editEntries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const editDiff = Math.abs(editTotalDebit - editTotalCredit);
  const balanced = editDiff < 0.005;

  return (
    <>
      {editing ? (
        <>
          <tr className="border-b border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-50/60">
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
            <td colSpan={2} className="px-2 py-2 text-right">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving || !editDesc.trim() || !editDate || !balanced}
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
            <td className="px-2 py-2 text-right">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
          <tr className="bg-blue-50/40 border-b border-blue-100">
            <td colSpan={6} className="px-6 py-2 border-l-2 border-blue-400">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-1.5 font-medium w-[40%]">{t("Account")}</th>
                    <th className="text-right pb-1.5 font-medium w-[20%]">{t("Debit")}</th>
                    <th className="text-right pb-1.5 font-medium w-[20%]">{t("Credit")}</th>
                    <th className="text-left pb-1.5 font-medium w-[20%]">{t("Memo")}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {editEntries.map((ee, idx) => (
                    <tr key={ee.id} className="border-t border-blue-100">
                      <td className="py-1 pr-1">
                        <AccountSelect
                          value={ee.account_id}
                          accounts={accounts}
                          onChange={(id) => updateEntry(idx, "account_id", id)}
                          placeholder={t("Select account")}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ee.debit}
                          onChange={(ev) => {
                            updateEntry(idx, "debit", ev.target.value);
                            if (ev.target.value) updateEntry(idx, "credit", "");
                          }}
                          onClick={(ev) => ev.stopPropagation()}
                          placeholder="0.00"
                          className="w-full px-1.5 py-1 text-right border border-blue-200 rounded bg-white tabular-nums"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ee.credit}
                          onChange={(ev) => {
                            updateEntry(idx, "credit", ev.target.value);
                            if (ev.target.value) updateEntry(idx, "debit", "");
                          }}
                          onClick={(ev) => ev.stopPropagation()}
                          placeholder="0.00"
                          className="w-full px-1.5 py-1 text-right border border-blue-200 rounded bg-white tabular-nums"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          value={ee.memo}
                          onChange={(ev) => updateEntry(idx, "memo", ev.target.value)}
                          onClick={(ev) => ev.stopPropagation()}
                          placeholder={t("Memo")}
                          className="w-full px-1.5 py-1 border border-blue-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-1 pl-1">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            removeEntry(idx);
                          }}
                          disabled={editEntries.length <= 2}
                          className="p-0.5 rounded text-gray-300 hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-blue-200">
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          addEntry();
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-3 h-3" />
                        {t("Add Entry")}
                      </button>
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatCurrency(editTotalDebit)}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatCurrency(editTotalCredit)}
                    </td>
                    <td colSpan={2}>
                      <span
                        className={cn(
                          "text-xs font-medium ml-2",
                          balanced ? "text-green-600" : "text-red-600",
                        )}
                      >
                        {balanced
                          ? t("Balanced")
                          : `${t("Difference")}: ${formatCurrency(editDiff)}`}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>
          {editError && (
            <tr className="bg-red-50 border-b border-red-100">
              <td colSpan={6} className="px-4 py-1.5 text-xs text-red-600">
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
          <td className="px-4 py-2.5 text-sm text-gray-500">{txn.reference ?? "—"}</td>
          <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[180px] truncate">
            {accountNames}
          </td>
          <td className="px-4 py-2.5 text-sm text-right tabular-nums">
            <span
              className={cn(
                amountLabel === "expense" && "text-red-600",
                amountLabel === "income" && "text-green-600",
                amountLabel === "transfer" && "text-blue-600",
              )}
            >
              {displayAmount < 0 ? "-" : "+"}
              {formatCurrency(Math.abs(displayAmount))}
            </span>
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
                  expanded && "rotate-180",
                )}
              />
            </div>
          </td>
        </tr>
      )}

      {expanded && !editing && (
        <tr className="bg-blue-50/50 border-b border-blue-100 dark:border-blue-800 dark:bg-blue-50/50">
          <td colSpan={6} className="px-6 py-3 border-l-2 border-blue-400 dark:border-blue-500">
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
                  <tr key={entry.id} className="border-t border-blue-100 dark:border-blue-800">
                    <td className="py-1 text-gray-700">{entry.account_name ?? entry.account_id}</td>
                    <td className="py-1 text-right pr-8 tabular-nums text-gray-700">
                      {parseFloat(entry.debit) > 0 ? formatCurrency(entry.debit) : "—"}
                    </td>
                    <td className="py-1 text-right pr-8 tabular-nums text-gray-700">
                      {parseFloat(entry.credit) > 0 ? formatCurrency(entry.credit) : "—"}
                    </td>
                    <td className="py-1 text-gray-500 italic">{entry.memo ?? ""}</td>
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

export function LedgerView({
  clientId,
  dateFrom,
  dateTo,
  accountId,
  searchQuery,
  onDeleteTxn,
  onEditTxn,
}: LedgerViewProps) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const {
    data: transactions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["transactions", clientId, dateFrom, dateTo, accountId, searchQuery],
    queryFn: () =>
      invoke<TransactionWithEntries[]>("list_transactions", {
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        accountId: accountId ?? null,
        search: searchQuery ?? null,
        clientId,
      }),
  });

  const sortedTransactions = useMemo(() => {
    const items = [...(transactions ?? [])];
    items.sort((a, b) => {
      let result = 0;

      if (sortKey === "date") {
        result = a.txn_date.localeCompare(b.txn_date);
      } else if (sortKey === "description") {
        result = a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
      } else if (sortKey === "reference") {
        result = (a.reference ?? "").localeCompare(b.reference ?? "", undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "accounts") {
        result = getTransactionAccountNames(a).localeCompare(
          getTransactionAccountNames(b),
          undefined,
          { sensitivity: "base" },
        );
      } else if (sortKey === "amount") {
        result = getTransactionDisplayAmount(a) - getTransactionDisplayAmount(b);
      }

      if (result === 0) {
        result = a.created_at.localeCompare(b.created_at);
      }

      return sortDirection === "asc" ? result : -result;
    });
    return items;
  }, [transactions, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "date" ? "desc" : "asc");
      return key;
    });
  };

  const SortHeader = ({
    label,
    keyName,
    align = "left",
  }: {
    label: string;
    keyName: SortKey;
    align?: "left" | "right";
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(keyName)}
      className={cn(
        "inline-flex items-center gap-1 hover:text-gray-700 transition-colors",
        align === "right" && "ml-auto",
      )}
    >
      <span>{label}</span>
      <ArrowUpDown className="w-3.5 h-3.5" />
      {sortKey === keyName && (
        <span className="text-[10px] font-bold">{sortDirection === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );

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
              <SortHeader label={t("Date")} keyName="date" />
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <SortHeader label={t("Description")} keyName="description" />
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <SortHeader label={t("Reference")} keyName="reference" />
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <SortHeader label={t("Accounts")} keyName="accounts" />
            </th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
              <SortHeader label={t("Amount")} keyName="amount" align="right" />
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
              <td colSpan={6} className="px-4 py-8">
                <EmptyState
                  icon={<Receipt className="w-6 h-6" />}
                  title={t("No transactions yet")}
                  description={t("Record your first transaction to start tracking.")}
                  action={{ label: t("Add transaction"), onClick: onEditTxn }}
                />
              </td>
            </tr>
          )}

          {!isLoading &&
            sortedTransactions.map((txn) => (
              <TxnRow
                key={txn.id}
                txn={txn}
                clientId={clientId}
                onDelete={onDeleteTxn}
                onEdit={onEditTxn}
              />
            ))}
        </tbody>
        {!isLoading && sortedTransactions.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6} className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                {t("Showing {count} transaction{s}", {
                  count: String(sortedTransactions.length),
                  s: sortedTransactions.length !== 1 ? "s" : "",
                })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
