import { Plus } from "lucide-react";
import type { Account } from "../../../lib/tauri";
import { cn } from "../../../lib/utils";
import { EntryRow } from "./EntryRow";
import type { EntryRowData } from "./EntryRow";

interface EntryRowsProps {
  entries: EntryRowData[];
  accounts: Account[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  onUpdate: (id: string, field: keyof Omit<EntryRowData, "id">, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function EntryRows({
  entries,
  accounts,
  totalDebit,
  totalCredit,
  isBalanced,
  onUpdate,
  onRemove,
  onAdd,
}: EntryRowsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Entries</span>
      </div>

      <div className="border border-gray-200 rounded overflow-visible">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-0 bg-gray-50 border-b border-gray-200 rounded-t">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Account</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Debit</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Credit</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Memo</div>
          <div className="w-8" />
        </div>

        {/* Entry rows */}
        {entries.map((row) => (
          <EntryRow
            key={row.id}
            row={row}
            accounts={accounts}
            canRemove={entries.length > 2}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}

        {/* Totals row */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-0 bg-gray-50 border-t border-gray-200 rounded-b">
          <div className="px-3 py-2 text-xs font-semibold text-gray-600">Totals</div>
          <div className="px-3 py-2 text-xs font-semibold text-right text-gray-900">
            {totalDebit > 0 ? fmt(totalDebit) : "—"}
          </div>
          <div className="px-3 py-2 text-xs font-semibold text-right text-gray-900">
            {totalCredit > 0 ? fmt(totalCredit) : "—"}
          </div>
          <div className="px-3 py-2 col-span-2 flex items-center gap-2">
            {totalDebit > 0 || totalCredit > 0 ? (
              isBalanced ? (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06z" />
                  </svg>
                  Balanced
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM8 4a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 4zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                  </svg>
                  Difference:{" "}
                  {fmt(Math.abs(totalDebit - totalCredit))}
                </span>
              )
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Entry
      </button>

      {(totalDebit > 0 || totalCredit > 0) && (
        <div className={cn(
          "mt-3 flex items-center gap-4 px-4 py-2.5 rounded-lg border",
          isBalanced
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        )}>
          <div className="flex-1 grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500">Total Debits</span>
              <div className="font-semibold text-gray-900 tabular-nums">{fmt(totalDebit)}</div>
            </div>
            <div>
              <span className="text-gray-500">Total Credits</span>
              <div className="font-semibold text-gray-900 tabular-nums">{fmt(totalCredit)}</div>
            </div>
            <div>
              <span className="text-gray-500">Difference</span>
              <div className={cn(
                "font-semibold tabular-nums",
                isBalanced ? "text-green-600" : "text-red-600"
              )}>
                {fmt(Math.abs(totalDebit - totalCredit))}
              </div>
            </div>
          </div>
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full",
            isBalanced ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
          )}>
            {isBalanced ? (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
