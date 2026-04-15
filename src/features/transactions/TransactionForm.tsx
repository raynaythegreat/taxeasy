import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, X, ChevronDown, Search } from "lucide-react";
import { listAccounts, createTransaction, scanReceipt, suggestCategory, pickReceiptFile } from "../../lib/tauri";
import type { Account, AccountType, EntryPayload, CategorizeSuggestion } from "../../lib/tauri";
import { cn, today } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntryRow {
  id: string;
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
}

interface TransactionFormProps {
  onClose: () => void;
  onCreated: () => void;
  onSaveAndNew?: () => void;
  defaultDate?: string;
  taxYear?: number;
  onDateUsed?: () => void;
}

type SimpleType = "expense" | "income" | "transfer";

interface SimpleState {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptyRow(): EntryRow {
  return { id: crypto.randomUUID(), account_id: "", debit: "", credit: "", memo: "" };
}

function makeSimpleState(): SimpleState {
  return {
    txnType: "expense",
    date: today(),
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

// ── AccountSelect ─────────────────────────────────────────────────────────────

interface AccountSelectProps {
  value: string;
  accounts: Account[];
  onChange: (accountId: string) => void;
  placeholder?: string;
}

function AccountSelect({ value, accounts, onChange, placeholder }: AccountSelectProps) {
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
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    );
  });

  const grouped = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>(
    (acc, type) => {
      const items = filtered.filter((a) => a.account_type === type);
      if (items.length > 0) acc[type] = items;
      return acc;
    },
    {}
  );

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-1 px-2 py-1.5 text-sm border rounded bg-white text-left",
          "border-gray-300 hover:border-gray-400 focus:outline-none focus:border-blue-500",
          !selected && "text-gray-400"
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
                      a.id === value && "bg-blue-50 text-blue-700"
                    )}
                  >
                    <span className="font-mono text-gray-500 w-12 shrink-0">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">{t("No accounts found")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SimpleForm ────────────────────────────────────────────────────────────────

interface SimpleFormProps {
  simple: SimpleState;
  accounts: Account[];
  onChange: <K extends keyof SimpleState>(field: K, value: SimpleState[K]) => void;
}

function SimpleForm({ simple, accounts, onChange }: SimpleFormProps) {
  const { t } = useI18n();
  const balanceSheetAccounts = accounts.filter((a) =>
    ["asset", "liability", "equity"].includes(a.account_type)
  );
  const debitAccounts = accounts.filter((a) =>
    ["expense", "asset", "liability", "equity"].includes(a.account_type)
  );
  const creditAccounts = accounts.filter((a) =>
    ["revenue", "liability", "equity"].includes(a.account_type)
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
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
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
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input
            type="number"
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
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06z" />
          </svg>
          Balanced
        </span>
        <span className="text-xs text-gray-400">— entries are auto-generated</span>
      </div>
    </div>
  );
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isSimpleValid(s: SimpleState): boolean {
  const amt = parseFloat(s.amount);
  if (!s.description.trim() || isNaN(amt) || amt <= 0) return false;
  if (!s.date) return false;
  if (s.txnType === "expense") return !!(s.paidFrom && s.category);
  if (s.txnType === "income") return !!(s.depositedTo && s.source);
  if (s.txnType === "transfer") return !!(s.fromAccount && s.toAccount && s.fromAccount !== s.toAccount);
  return false;
}

function buildSimpleEntries(s: SimpleState): EntryPayload[] {
  const amt = parseFloat(s.amount).toFixed(2);
  const memo = s.memo.trim() || undefined;

  if (s.txnType === "expense") {
    return [
      { account_id: s.category, debit: amt, memo },
      { account_id: s.paidFrom, credit: amt, memo },
    ];
  }
  if (s.txnType === "income") {
    return [
      { account_id: s.depositedTo, debit: amt, memo },
      { account_id: s.source, credit: amt, memo },
    ];
  }
  // transfer
  return [
    { account_id: s.toAccount, debit: amt, memo },
    { account_id: s.fromAccount, credit: amt, memo },
  ];
}

// ── TransactionForm ───────────────────────────────────────────────────────────

export function TransactionForm({ onClose, onCreated, onSaveAndNew, defaultDate: defaultDateProp, onDateUsed }: TransactionFormProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const [simple, setSimple] = useState<SimpleState>(() => {
    const base = makeSimpleState();
    if (defaultDateProp) base.date = defaultDateProp;
    return base;
  });

  const [txnDate, setTxnDate] = useState(() => defaultDateProp || today());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([makeEmptyRow(), makeEmptyRow()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<CategorizeSuggestion | null>(null);
  const [suggestionFor, setSuggestionFor] = useState<string>(""); // tracks which description the suggestion is for

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  // ── Advanced mode helpers ──────────────────────────────────────────────────

  const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;
  const advancedCanSave = isBalanced && description.trim().length > 0 && !submitting;

  const updateEntry = useCallback(
    (id: string, field: keyof Omit<EntryRow, "id">, value: string) => {
      setEntries((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
      );
    },
    []
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, makeEmptyRow()]);
  }, []);

  // ── Simple mode helper ─────────────────────────────────────────────────────

  const updateSimple = useCallback(
    <K extends keyof SimpleState>(field: K, value: SimpleState[K]) => {
      setSimple((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // ── Scan Receipt ──────────────────────────────────────────────────────────

  const handleScanReceipt = async () => {
    setScanError(null);
    setScanning(true);
    try {
      const filePath = await pickReceiptFile();
      if (!filePath) return;
      const result = await scanReceipt(filePath);
      // Pre-fill simple mode fields
      if (result.vendor) updateSimple("description", result.vendor);
      if (result.date) updateSimple("date", result.date);
      if (result.total) updateSimple("amount", result.total);
      // Get AI category suggestion if we have enough info
      if (result.vendor && result.total) {
        try {
          const suggestion = await suggestCategory(result.vendor, result.total);
          setAiSuggestion(suggestion);
          setSuggestionFor(result.vendor);
        } catch {
          // non-fatal
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  const handleAcceptSuggestion = (suggestion: CategorizeSuggestion) => {
    // Apply suggestion to the relevant simple mode field
    if (simple.txnType === "expense") updateSimple("category", suggestion.account_id);
    else if (simple.txnType === "income") updateSimple("source", suggestion.account_id);
    setAiSuggestion(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const canSave = mode === "simple" ? isSimpleValid(simple) : advancedCanSave;
    if (!canSave || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "simple") {
        await createTransaction({
          txn_date: simple.date,
          description: simple.description.trim(),
          entries: buildSimpleEntries(simple),
        });
      } else {
        const entryPayloads: EntryPayload[] = entries
          .filter((row) => row.account_id)
          .map((row) => ({
            account_id: row.account_id,
            debit: row.debit || undefined,
            credit: row.credit || undefined,
            memo: row.memo || undefined,
          }));
        await createTransaction({
          txn_date: txnDate,
          description: description.trim(),
          reference: reference.trim() || undefined,
          entries: entryPayloads,
        });
      }
      onCreated();
      if (onDateUsed) onDateUsed();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save transaction: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAndNew = async () => {
    const canSaveNow = mode === "simple" ? isSimpleValid(simple) : advancedCanSave;
    if (!canSaveNow || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "simple") {
        await createTransaction({
          txn_date: simple.date,
          description: simple.description.trim(),
          entries: buildSimpleEntries(simple),
        });
      } else {
        const entryPayloads: EntryPayload[] = entries
          .filter((row) => row.account_id)
          .map((row) => ({
            account_id: row.account_id,
            debit: row.debit || undefined,
            credit: row.credit || undefined,
            memo: row.memo || undefined,
          }));
        await createTransaction({
          txn_date: txnDate,
          description: description.trim(),
          reference: reference.trim() || undefined,
          entries: entryPayloads,
        });
      }
      onCreated();
      const newDate = defaultDateProp || today();
      setSimple({
        txnType: simple.txnType,
        date: newDate,
        description: "",
        amount: "",
        paidFrom: "",
        category: "",
        depositedTo: "",
        source: "",
        fromAccount: "",
        toAccount: "",
        memo: "",
      });
      setDescription("");
      setReference("");
      setEntries([makeEmptyRow(), makeEmptyRow()]);
      setTxnDate(newDate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save transaction: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const canSave = mode === "simple"
    ? isSimpleValid(simple) && !submitting
    : advancedCanSave;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">New Transaction</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "simple" ? "advanced" : "simple"))}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
              mode === "advanced"
                ? "border-blue-400 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
            )}
          >
            {mode === "simple" ? "Advanced" : "Simple"}
          </button>
          <button
            type="button"
            onClick={handleScanReceipt}
            disabled={scanning}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {scanning ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            {scanning ? "Scanning…" : "Scan Receipt"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {mode === "simple" ? (
          <SimpleForm simple={simple} accounts={accounts} onChange={updateSimple} />
        ) : (
          <>
            {/* Advanced: Basic fields */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    required
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setTxnDate(today())}
                    className="px-2 py-1.5 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50 whitespace-nowrap"
                  >
                    Today
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
            {t("Description")} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Transaction description"
                  required
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reference (optional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Check #, invoice #, etc."
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Advanced: Entries table */}
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
                  <div
                    key={row.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-0 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="px-2 py-1.5 border-r border-gray-100">
                      <AccountSelect
                        value={row.account_id}
                        accounts={accounts}
                        onChange={(id) => updateEntry(row.id, "account_id", id)}
                      />
                    </div>
                    <div className="px-2 py-1.5 border-r border-gray-100">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.debit}
                        onChange={(e) => updateEntry(row.id, "debit", e.target.value)}
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
                        onChange={(e) => updateEntry(row.id, "credit", e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="px-2 py-1.5 border-r border-gray-100">
                      <input
                        type="text"
                        value={row.memo}
                        onChange={(e) => updateEntry(row.id, "memo", e.target.value)}
                        placeholder="Optional memo"
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center justify-center w-8 px-1">
                      <button
                        type="button"
                        onClick={() => removeEntry(row.id)}
                        disabled={entries.length <= 2}
                        className="p-0.5 rounded text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Totals row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-0 bg-gray-50 border-t border-gray-200 rounded-b">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-600">Totals</div>
                  <div className="px-3 py-2 text-xs font-semibold text-right text-gray-900">
                    {totalDebit > 0
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalDebit)
                      : "—"}
                  </div>
                  <div className="px-3 py-2 text-xs font-semibold text-right text-gray-900">
                    {totalCredit > 0
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalCredit)
                      : "—"}
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
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                            Math.abs(totalDebit - totalCredit)
                          )}
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={addEntry}
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
                      <div className="font-semibold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalDebit)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Credits</span>
                      <div className="font-semibold text-gray-900 tabular-nums">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalCredit)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Difference</span>
                      <div className={cn(
                        "font-semibold tabular-nums",
                        isBalanced ? "text-green-600" : "text-red-600"
                      )}>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(totalDebit - totalCredit))}
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
          </>
        )}

        {/* Scan error */}
        {scanError && (
          <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
            {scanError}
          </div>
        )}

        {/* AI category suggestion chip */}
        {aiSuggestion && suggestionFor === simple.description && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs">
            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
            </svg>
            <span className="text-blue-700 flex-1">
              AI suggests: <strong>{aiSuggestion.account_name}</strong> — {aiSuggestion.reason}
            </span>
            <button
              type="button"
              onClick={() => handleAcceptSuggestion(aiSuggestion)}
              className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setAiSuggestion(null)}
              className="px-1.5 py-0.5 rounded text-blue-400 hover:text-blue-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          {onSaveAndNew && (
            <button
              type="button"
              onClick={handleSaveAndNew}
              disabled={!canSave}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded",
                canSave
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              {submitting ? "Saving…" : t("Save & New")}
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded",
              canSave
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            )}
          >
            {submitting ? "Saving…" : t("Save Transaction")}
          </button>
        </div>
      </form>
    </div>
  );
}
