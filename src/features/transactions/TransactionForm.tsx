import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAccounts, createTransaction, scanReceipt, suggestCategory, pickReceiptFile } from "../../lib/tauri";
import type { EntryPayload, CategorizeSuggestion } from "../../lib/tauri";
import { today } from "../../lib/utils";
import { SimpleForm, makeSimpleState } from "./form/SimpleForm";
import type { SimpleState } from "./form/SimpleForm";
import { EntryRows } from "./form/EntryRows";
import type { EntryRowData } from "./form/EntryRow";
import { FormActions } from "./form/FormActions";
import { AdvancedFields } from "./form/AdvancedFields";
import { FormHeader } from "./form/FormHeader";
import { AiSuggestionChip } from "./form/AiSuggestionChip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TransactionFormProps {
  onClose: () => void;
  onCreated: () => void;
  onSaveAndNew?: () => void;
  defaultDate?: string;
  taxYear?: number;
  onDateUsed?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptyRow(): EntryRowData {
  return { id: crypto.randomUUID(), account_id: "", debit: "", credit: "", memo: "" };
}

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
  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const [simple, setSimple] = useState<SimpleState>(() =>
    makeSimpleState(defaultDateProp || today())
  );

  const [txnDate, setTxnDate] = useState(() => defaultDateProp || today());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [entries, setEntries] = useState<EntryRowData[]>([makeEmptyRow(), makeEmptyRow()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<CategorizeSuggestion | null>(null);
  const [suggestionFor, setSuggestionFor] = useState<string>("");

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
    (id: string, field: keyof Omit<EntryRowData, "id">, value: string) => {
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
      if (result.vendor) updateSimple("description", result.vendor);
      if (result.date) updateSimple("date", result.date);
      if (result.total) updateSimple("amount", result.total);
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
    if (simple.txnType === "expense") updateSimple("category", suggestion.account_id);
    else if (simple.txnType === "income") updateSimple("source", suggestion.account_id);
    setAiSuggestion(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const buildAdvancedPayloads = (): EntryPayload[] =>
    entries
      .filter((row) => row.account_id)
      .map((row) => ({
        account_id: row.account_id,
        debit: row.debit || undefined,
        credit: row.credit || undefined,
        memo: row.memo || undefined,
      }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const canSave = mode === "simple" ? isSimpleValid(simple) : advancedCanSave;
    if (!canSave || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "simple") {
        await createTransaction({ txn_date: simple.date, description: simple.description.trim(), entries: buildSimpleEntries(simple) });
      } else {
        await createTransaction({ txn_date: txnDate, description: description.trim(), reference: reference.trim() || undefined, entries: buildAdvancedPayloads() });
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
        await createTransaction({ txn_date: simple.date, description: simple.description.trim(), entries: buildSimpleEntries(simple) });
      } else {
        await createTransaction({ txn_date: txnDate, description: description.trim(), reference: reference.trim() || undefined, entries: buildAdvancedPayloads() });
      }
      onCreated();
      const newDate = defaultDateProp || today();
      setSimple({ ...makeSimpleState(newDate), txnType: simple.txnType });
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

  const canSave = mode === "simple" ? isSimpleValid(simple) && !submitting : advancedCanSave;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <FormHeader
        mode={mode}
        scanning={scanning}
        onToggleMode={() => setMode((m) => (m === "simple" ? "advanced" : "simple"))}
        onScanReceipt={handleScanReceipt}
        onClose={onClose}
      />

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {mode === "simple" ? (
          <SimpleForm simple={simple} accounts={accounts} onChange={updateSimple} />
        ) : (
          <>
            <AdvancedFields
              txnDate={txnDate}
              description={description}
              reference={reference}
              onDateChange={setTxnDate}
              onDescriptionChange={setDescription}
              onReferenceChange={setReference}
            />

            <EntryRows
              entries={entries}
              accounts={accounts}
              totalDebit={totalDebit}
              totalCredit={totalCredit}
              isBalanced={isBalanced}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              onAdd={addEntry}
            />
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
          <AiSuggestionChip
            suggestion={aiSuggestion}
            onAccept={handleAcceptSuggestion}
            onDismiss={() => setAiSuggestion(null)}
          />
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}

        <FormActions
          canSave={canSave}
          submitting={submitting}
          onClose={onClose}
          onSaveAndNew={onSaveAndNew ? handleSaveAndNew : undefined}
        />
      </form>
    </div>
  );
}
