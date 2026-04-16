import { Trash2 } from "lucide-react";
import type { Account } from "../../../lib/tauri";
import { AccountSelect } from "./AccountSelect";

export interface EntryRowData {
  id: string;
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
}

interface EntryRowProps {
  row: EntryRowData;
  accounts: Account[];
  canRemove: boolean;
  onUpdate: (id: string, field: keyof Omit<EntryRowData, "id">, value: string) => void;
  onRemove: (id: string) => void;
}

export function EntryRow({ row, accounts, canRemove, onUpdate, onRemove }: EntryRowProps) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-0 border-b border-gray-100 last:border-b-0">
      <div className="px-2 py-1.5 border-r border-gray-100">
        <AccountSelect
          value={row.account_id}
          accounts={accounts}
          onChange={(id) => onUpdate(row.id, "account_id", id)}
        />
      </div>
      <div className="px-2 py-1.5 border-r border-gray-100">
        <input
          type="number"
          min="0"
          step="0.01"
          value={row.debit}
          onChange={(e) => onUpdate(row.id, "debit", e.target.value)}
          placeholder="0.00"
          className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="px-2 py-1.5 border-r border-gray-100">
        <input
          type="number"
          min="0"
          step="0.01"
          value={row.credit}
          onChange={(e) => onUpdate(row.id, "credit", e.target.value)}
          placeholder="0.00"
          className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="px-2 py-1.5 border-r border-gray-100">
        <input
          type="text"
          value={row.memo}
          onChange={(e) => onUpdate(row.id, "memo", e.target.value)}
          placeholder="Optional memo"
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex items-center justify-center w-8 px-1">
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          disabled={!canRemove}
          className="p-0.5 rounded text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
