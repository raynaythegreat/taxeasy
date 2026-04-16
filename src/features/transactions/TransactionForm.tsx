import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import type { CategorizeSuggestion, EntryPayload } from "../../lib/tauri";
import {
  createTransaction,
  listAccounts,
  pickReceiptFile,
  scanReceipt,
  suggestCategory,
} from "../../lib/tauri";
import { today } from "../../lib/utils";
import { AdvancedFields } from "./form/AdvancedFields";
import { AiSuggestionChip } from "./form/AiSuggestionChip";
import type { EntryRowData } from "./form/EntryRow";
import { EntryRows } from "./form/EntryRows";
import { FormActions } from "./form/FormActions";
import { FormHeader } from "./form/FormHeader";
import type { SimpleState } from "./form/SimpleForm";
import { makeSimpleState, SimpleForm } from "./form/SimpleForm";
import type { SimpleFormValues } from "./form/schema";
import { advancedSchema, simpleSchema } from "./form/schema";

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

function buildSimpleEntries(s: SimpleFormValues): EntryPayload[] {
  const amt = parseFloat(s.amount).toFixed(2);
  const memo = s.memo?.trim() || undefined;
  if (s.txnType === "expense") {
    return [
      { account_id: s.category ?? "", debit: amt, memo },
      { account_id: s.paidFrom ?? "", credit: amt, memo },
    ];
  }
  if (s.txnType === "income") {
    return [
      { account_id: s.depositedTo ?? "", debit: amt, memo },
      { account_id: s.source ?? "", credit: amt, memo },
    ];
  }
  // transfer
  return [
    { account_id: s.toAccount ?? "", debit: amt, memo },
    { account_id: s.fromAccount ?? "", credit: amt, memo },
  ];
}

// ── TransactionForm ───────────────────────────────────────────────────────────

export function TransactionForm({
  onClose,
  onCreated,
  onSaveAndNew,
  defaultDate: defaultDateProp,
  onDateUsed,
}: TransactionFormProps) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [entries, setEntries] = useState<EntryRowData[]>([makeEmptyRow(), makeEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<CategorizeSuggestion | null>(null);
  const [suggestionFor, setSuggestionFor] = useState<string>("");

  // ── Simple form ──────────────────────────────────────────────────────────
  const simpleForm = useForm<SimpleFormValues>({
    resolver: zodResolver(simpleSchema),
    defaultValues: makeSimpleState(defaultDateProp || today()) as SimpleFormValues,
  });
  const simpleValues = simpleForm.watch();
  const simpleErrors = simpleForm.formState.errors;

  // ── Advanced form ────────────────────────────────────────────────────────
  const advForm = useForm({
    resolver: zodResolver(advancedSchema),
    defaultValues: {
      txnDate: defaultDateProp || today(),
      description: "",
      reference: "",
    },
  });
  const advValues = advForm.watch();
  const advErrors = advForm.formState.errors;

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  // ── Advanced mode helpers ────────────────────────────────────────────────

  const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;
  const advancedCanSave = isBalanced && advValues.description.trim().length > 0 && !submitting;

  const updateEntry = useCallback(
    (id: string, field: keyof Omit<EntryRowData, "id">, value: string) => {
      setEntries((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, makeEmptyRow()]);
  }, []);

  // ── Simple mode helper ───────────────────────────────────────────────────

  const updateSimple = useCallback(
    <K extends keyof SimpleState>(field: K, value: SimpleState[K]) => {
      simpleForm.setValue(field as keyof SimpleFormValues, value as never, {
        shouldValidate: simpleForm.formState.isSubmitted,
      });
    },
    [simpleForm],
  );

  // ── Scan Receipt ─────────────────────────────────────────────────────────

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
    if (simpleValues.txnType === "expense") updateSimple("category", suggestion.account_id);
    else if (simpleValues.txnType === "income") updateSimple("source", suggestion.account_id);
    setAiSuggestion(null);
  };

  // ── Submit helpers ───────────────────────────────────────────────────────

  const buildAdvancedPayloads = (): EntryPayload[] =>
    entries
      .filter((row) => row.account_id)
      .map((row) => ({
        account_id: row.account_id,
        debit: row.debit || undefined,
        credit: row.credit || undefined,
        memo: row.memo || undefined,
      }));

  async function saveTransaction(values: SimpleFormValues | null, isNew: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (mode === "simple" && values) {
        await createTransaction({
          txn_date: values.date,
          description: values.description.trim(),
          entries: buildSimpleEntries(values),
        });
      } else {
        await createTransaction({
          txn_date: advValues.txnDate,
          description: advValues.description.trim(),
          reference: advValues.reference?.trim() || undefined,
          entries: buildAdvancedPayloads(),
        });
      }
      onCreated();
      if (onDateUsed) onDateUsed();
      if (isNew) {
        const newDate = defaultDateProp || today();
        simpleForm.reset({
          ...makeSimpleState(newDate),
          txnType: simpleValues.txnType,
        } as SimpleFormValues);
        advForm.reset({ txnDate: newDate, description: "", reference: "" });
        setEntries([makeEmptyRow(), makeEmptyRow()]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(`Failed to save transaction: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Submit handlers ──────────────────────────────────────────────────────

  const handleSubmit =
    mode === "simple"
      ? simpleForm.handleSubmit((values) => saveTransaction(values, false))
      : advForm.handleSubmit(() => saveTransaction(null, false));

  const handleSaveAndNew = async () => {
    if (mode === "simple") {
      await simpleForm.handleSubmit((values) => saveTransaction(values, true))();
    } else {
      await advForm.handleSubmit(() => saveTransaction(null, true))();
    }
  };

  const canSave =
    mode === "simple"
      ? simpleSchema.safeParse(simpleValues).success && !submitting
      : advancedCanSave;

  // ── Render ───────────────────────────────────────────────────────────────

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
          <>
            <SimpleForm
              simple={simpleValues as SimpleState}
              accounts={accounts}
              onChange={updateSimple}
            />
            {/* Simple mode field errors */}
            {simpleForm.formState.isSubmitted && simpleErrors.description && (
              <p role="alert" className="text-xs text-red-600">
                {simpleErrors.description.message}
              </p>
            )}
            {simpleForm.formState.isSubmitted && simpleErrors.amount && (
              <p role="alert" className="text-xs text-red-600">
                {simpleErrors.amount.message}
              </p>
            )}
            {simpleForm.formState.isSubmitted && simpleErrors.date && (
              <p role="alert" className="text-xs text-red-600">
                {simpleErrors.date.message}
              </p>
            )}
            {simpleForm.formState.isSubmitted && simpleErrors.txnType && (
              <p role="alert" className="text-xs text-red-600">
                {simpleErrors.txnType.message}
              </p>
            )}
          </>
        ) : (
          <>
            <AdvancedFields
              txnDate={advValues.txnDate}
              description={advValues.description}
              reference={advValues.reference ?? ""}
              onDateChange={(v) =>
                advForm.setValue("txnDate", v, { shouldValidate: advForm.formState.isSubmitted })
              }
              onDescriptionChange={(v) =>
                advForm.setValue("description", v, {
                  shouldValidate: advForm.formState.isSubmitted,
                })
              }
              onReferenceChange={(v) => advForm.setValue("reference", v)}
            />
            {/* Advanced field errors */}
            {advForm.formState.isSubmitted && advErrors.description && (
              <p role="alert" className="text-xs text-red-600">
                {advErrors.description.message}
              </p>
            )}
            {advForm.formState.isSubmitted && advErrors.txnDate && (
              <p role="alert" className="text-xs text-red-600">
                {advErrors.txnDate.message}
              </p>
            )}

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
          <div
            role="alert"
            aria-live="polite"
            className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded"
          >
            {scanError}
          </div>
        )}

        {/* AI category suggestion chip */}
        {aiSuggestion && suggestionFor === simpleValues.description && (
          <AiSuggestionChip
            suggestion={aiSuggestion}
            onAccept={handleAcceptSuggestion}
            onDismiss={() => setAiSuggestion(null)}
          />
        )}

        {/* Submit error */}
        {submitError && (
          <div
            role="alert"
            aria-live="polite"
            className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded"
          >
            {submitError}
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
