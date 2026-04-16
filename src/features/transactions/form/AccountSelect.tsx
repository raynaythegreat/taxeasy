import { ChevronDown, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { useI18n } from "../../../lib/i18n";
import type { Account, AccountType } from "../../../lib/tauri";
import { cn } from "../../../lib/utils";

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

export interface AccountSelectProps {
  value: string;
  accounts: Account[];
  onChange: (accountId: string) => void;
  placeholder?: string;
}

export function AccountSelect({ value, accounts, onChange, placeholder }: AccountSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    asset: t("Assets"),
    liability: t("Liabilities"),
    equity: t("Equity"),
    revenue: t("Revenue"),
    expense: t("Expenses"),
  };

  const selected = accounts.find((a) => a.id === value);

  const filtered = accounts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const grouped = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    const items = filtered.filter((a) => a.account_type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-1 px-2 py-1.5 text-sm border rounded bg-white text-left",
          "border-gray-300 hover:border-gray-400 focus:outline-none focus:border-blue-500",
          !selected && "text-gray-400",
        )}
      >
        <span className="truncate">
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-[9999] bottom-full left-0 mb-1 w-72 bg-white border border-gray-200 rounded shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 rounded bg-gray-50">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder={t("Search accounts…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm bg-transparent outline-none"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                  {ACCOUNT_TYPE_LABELS[type as AccountType]}
                </div>
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelect(a.id)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex gap-2",
                      a.id === value && "bg-blue-50 text-blue-700",
                    )}
                  >
                    <span className="font-mono text-gray-500 w-12 shrink-0">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                {t("No accounts found")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
