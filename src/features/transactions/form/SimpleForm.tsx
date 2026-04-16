import { useI18n } from "../../../lib/i18n";
import type { Account } from "../../../lib/tauri";
import { cn } from "../../../lib/utils";
import { AccountSelect } from "./AccountSelect";

export type SimpleType = "expense" | "income" | "transfer";

export interface SimpleState {
  txnType: SimpleType;
  date: string;
  description: string;
  amount: string;
  // expense
  paidFrom: string;
  category: string;
  // income
  depositedTo: string;
  source: string;
  // transfer
  fromAccount: string;
  toAccount: string;
  // shared optional
  memo: string;
}

export interface SimpleFormProps {
  simple: SimpleState;
  accounts: Account[];
  onChange: <K extends keyof SimpleState>(field: K, value: SimpleState[K]) => void;
}

export function makeSimpleState(defaultDate?: string): SimpleState {
  return {
    txnType: "expense",
    date: defaultDate ?? "",
    description: "",
    amount: "",
    paidFrom: "",
    category: "",
    depositedTo: "",
    source: "",
    fromAccount: "",
    toAccount: "",
    memo: "",
  };
}

export function SimpleForm({ simple, accounts, onChange }: SimpleFormProps) {
  const { t } = useI18n();
  const balanceSheetAccounts = accounts.filter((a) =>
    ["asset", "liability", "equity"].includes(a.account_type),
  );
  const debitAccounts = accounts.filter((a) =>
    ["expense", "asset", "liability", "equity"].includes(a.account_type),
  );
  const creditAccounts = accounts.filter((a) =>
    ["revenue", "liability", "equity"].includes(a.account_type),
  );

  const SIMPLE_TYPE_OPTIONS: { value: SimpleType; label: string; sub: string }[] = [
    { value: "expense", label: t("Expense"), sub: t("Money went out") },
    { value: "income", label: t("Income"), sub: t("Money came in") },
    { value: "transfer", label: t("Transfer"), sub: t("Moved between accounts") },
  ];

  return (
    <div className="space-y-4">
      {/* Transaction type selector */}
      <div className="grid grid-cols-3 gap-2">
        {SIMPLE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange("txnType", opt.value)}
            className={cn(
              "flex flex-col items-center px-2 py-2.5 rounded-lg border text-center transition-colors",
              simple.txnType === opt.value
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
            )}
          >
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-xs text-gray-400 mt-0.5">{opt.sub}</span>
          </button>
        ))}
      </div>

      {/* Date + Description */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("Date")}</label>
          <input
            type="date"
            value={simple.date}
            onChange={(e) => onChange("date", e.target.value)}
            required
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Description <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={simple.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="What was this for?"
            required
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {t("Amount")} <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={simple.amount}
            onChange={(e) => onChange("amount", e.target.value)}
            placeholder="0.00"
            required
            className="w-full pl-6 pr-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Type-specific account selectors */}
      {simple.txnType === "expense" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Paid from <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.paidFrom}
              accounts={balanceSheetAccounts}
              onChange={(id) => onChange("paidFrom", id)}
              placeholder="Select checking, credit card, payable, loan…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Debit account <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.category}
              accounts={debitAccounts}
              onChange={(id) => onChange("category", id)}
              placeholder="Select expense, receivable, payable reduction, equity…"
            />
          </div>
        </>
      )}

      {simple.txnType === "income" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Deposited to <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.depositedTo}
              accounts={balanceSheetAccounts}
              onChange={(id) => onChange("depositedTo", id)}
              placeholder="Select bank, receivable, liability, equity…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Credit account <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.source}
              accounts={creditAccounts}
              onChange={(id) => onChange("source", id)}
              placeholder="Select revenue, loan, payable, owner investment…"
            />
          </div>
        </>
      )}

      {simple.txnType === "transfer" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              From account <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.fromAccount}
              accounts={balanceSheetAccounts}
              onChange={(id) => onChange("fromAccount", id)}
              placeholder="Transfer out of…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              To account <span className="text-red-400">*</span>
            </label>
            <AccountSelect
              value={simple.toAccount}
              accounts={balanceSheetAccounts}
              onChange={(id) => onChange("toAccount", id)}
              placeholder="Transfer in to…"
            />
          </div>
        </>
      )}

      {/* Memo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Memo (optional)</label>
        <input
          type="text"
          value={simple.memo}
          onChange={(e) => onChange("memo", e.target.value)}
          placeholder="Additional notes"
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Balanced badge — always balanced in simple mode */}
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06z" />
          </svg>
          Balanced
        </span>
        <span className="text-xs text-gray-400">— entries are auto-generated</span>
      </div>
    </div>
  );
}
