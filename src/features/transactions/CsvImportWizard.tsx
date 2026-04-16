import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Upload, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import {
  type ColumnMapping,
  type CsvPreview,
  type ImportResult,
  importCsv,
  pickCsvFile,
  previewCsv,
} from "../../lib/csv-import-api";
import { listAccounts } from "../../lib/tauri";
import type { Account, AccountType } from "../../lib/tauri";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface MappingState {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  referenceCol: number | undefined;
}

// ── Helper components ──────────────────────────────────────────────────────────

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

function AccountSelect({
  value,
  accounts,
  onChange,
  placeholder,
}: {
  value: string;
  accounts: Account[];
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const grouped = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    const items = accounts.filter((a) => a.account_type === type);
    if (items.length) acc[type] = items;
    return acc;
  }, {});
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
    >
      <option value="">{placeholder ?? t("— select account —")}</option>
      {Object.entries(grouped).map(([type, items]) => (
        <optgroup key={type} label={t(TYPE_LABELS[type as AccountType])}>
          {items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ColSelect({
  label,
  value,
  headers,
  onChange,
  optional,
}: {
  label: string;
  value: number | undefined;
  headers: string[];
  onChange: (v: number | undefined) => void;
  optional?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <label className="w-28 text-sm font-medium text-gray-700 shrink-0">
        {label}
        {optional && (
          <span className="ml-1 text-xs text-gray-400 font-normal">({t("optional")})</span>
        )}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
      >
        <option value="">{optional ? t("— none —") : t("— select column —")}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {i}: {h || `(col ${i})`}
          </option>
        ))}
      </select>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const { t } = useI18n();
  const steps: [Step, string][] = [
    [1, t("Pick File")],
    [2, t("Map Columns")],
    [3, t("Preview & Import")],
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map(([s, label], i) => (
        <div key={s} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              step === s
                ? "bg-blue-600 text-white"
                : step > s
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            <span>{s}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 1: File pick ──────────────────────────────────────────────────────────

function Step1({
  onPreview,
}: {
  onPreview: (path: string, preview: CsvPreview) => void;
}) {
  const { t } = useI18n();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: ({ path }: { path: string }) => previewCsv(path, 10),
    onSuccess: (data, vars) => {
      setError(null);
      onPreview(vars.path, data);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  const handlePickFile = async () => {
    const path = await pickCsvFile();
    if (!path) return;
    setFilePath(path);
    previewMutation.mutate({ path });
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="p-4 bg-blue-50 rounded-full">
          <FileText className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-800">{t("Select a CSV file")}</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          {t(
            "Pick a bank statement or transaction export in CSV format. Taxeasy will read the headers and preview the first rows.",
          )}
        </p>
      </div>

      {filePath && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400" />
          <span className="truncate max-w-xs">{filePath.split("/").pop()}</span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handlePickFile}
        disabled={previewMutation.isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Upload className="w-4 h-4" />
        {previewMutation.isPending ? t("Reading…") : t("Choose CSV File")}
      </button>
    </div>
  );
}

// ── Step 2: Column mapping ─────────────────────────────────────────────────────

function Step2({
  preview,
  mapping,
  onMappingChange,
  onNext,
  onBack,
}: {
  preview: CsvPreview;
  mapping: MappingState;
  onMappingChange: (m: MappingState) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const canProceed =
    mapping.dateCol !== undefined &&
    mapping.descriptionCol !== undefined &&
    mapping.amountCol !== undefined;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">{t("Map CSV Columns")}</h3>
          <p className="text-xs text-gray-500">
            {t("Tell Taxeasy which columns contain the date, description and amount.")}
          </p>
          <div className="space-y-3">
            <ColSelect
              label={t("Date")}
              value={mapping.dateCol}
              headers={preview.headers}
              onChange={(v) => onMappingChange({ ...mapping, dateCol: v ?? 0 })}
            />
            <ColSelect
              label={t("Description")}
              value={mapping.descriptionCol}
              headers={preview.headers}
              onChange={(v) => onMappingChange({ ...mapping, descriptionCol: v ?? 0 })}
            />
            <ColSelect
              label={t("Amount")}
              value={mapping.amountCol}
              headers={preview.headers}
              onChange={(v) => onMappingChange({ ...mapping, amountCol: v ?? 0 })}
            />
            <ColSelect
              label={t("Reference")}
              value={mapping.referenceCol}
              headers={preview.headers}
              onChange={(v) => onMappingChange({ ...mapping, referenceCol: v })}
              optional
            />
          </div>
        </div>

        {/* Sample preview */}
        <div>
          <h4 className="text-xs font-semibold text-gray-600 mb-2">{t("File Preview")}</h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                    >
                      {h || `col ${i}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-100 last:border-0">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[160px] truncate"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("Back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {t("Next")}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Preview & confirm ──────────────────────────────────────────────────

interface ParsedPreviewRow {
  date: string;
  description: string;
  amount: string;
  reference?: string;
  valid: boolean;
}

function parsePreviewRows(preview: CsvPreview, mapping: MappingState): ParsedPreviewRow[] {
  return preview.rows.slice(0, 5).map((row) => {
    const rawDate = row[mapping.dateCol] ?? "";
    const description = row[mapping.descriptionCol]?.trim() ?? "";
    const rawAmt = row[mapping.amountCol] ?? "";
    const reference = mapping.referenceCol !== undefined
      ? (row[mapping.referenceCol]?.trim() || undefined)
      : undefined;

    // Simple client-side validation matching backend logic
    const dateOk =
      /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate);
    const cleaned = rawAmt.replace(/[$€,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
    const amtOk = !Number.isNaN(Number(cleaned)) && cleaned !== "";

    return {
      date: rawDate,
      description,
      amount: rawAmt,
      reference,
      valid: dateOk && amtOk && description.length > 0,
    };
  });
}

function Step3({
  filePath,
  preview,
  mapping,
  accounts,
  onBack,
  onImported,
}: {
  filePath: string;
  preview: CsvPreview;
  mapping: MappingState;
  accounts: Account[];
  onBack: () => void;
  onImported: (result: ImportResult) => void;
}) {
  const { t } = useI18n();
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const rows = parsePreviewRows(preview, mapping);
  const validCount = rows.filter((r) => r.valid).length;
  const totalRows = preview.rows.length;

  const importMutation = useMutation({
    mutationFn: () => {
      const mappingArg: ColumnMapping = {
        dateCol: mapping.dateCol,
        descriptionCol: mapping.descriptionCol,
        amountCol: mapping.amountCol,
        referenceCol: mapping.referenceCol,
      };
      return importCsv(filePath, mappingArg, debitAccountId, creditAccountId);
    },
    onSuccess: (result) => {
      setImportError(null);
      onImported(result);
    },
    onError: (e: unknown) => {
      setImportError(e instanceof Error ? e.message : String(e));
    },
  });

  const canImport = debitAccountId && creditAccountId;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{t("Default Accounts")}</h3>
          <p className="text-xs text-gray-500 mb-3">
            {t(
              "All imported rows will use these accounts. You can recategorize later in the draft queue.",
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("Debit Account")}
              </label>
              <AccountSelect
                value={debitAccountId}
                accounts={accounts}
                onChange={setDebitAccountId}
                placeholder={t("— select —")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("Credit Account")}
              </label>
              <AccountSelect
                value={creditAccountId}
                accounts={accounts}
                onChange={setCreditAccountId}
                placeholder={t("— select —")}
              />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-gray-600 mb-2">
            {t("Preview (first 5 rows)")}
          </h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("Date")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    {t("Description")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("Amount")}</th>
                  {mapping.referenceCol !== undefined && (
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      {t("Reference")}
                    </th>
                  )}
                  <th className="px-3 py-2 text-left font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 last:border-0 ${!row.valid ? "bg-red-50" : ""}`}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-1.5 max-w-[200px] truncate">{row.description}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{row.amount}</td>
                    {mapping.referenceCol !== undefined && (
                      <td className="px-3 py-1.5 whitespace-nowrap">{row.reference ?? "—"}</td>
                    )}
                    <td className="px-3 py-1.5">
                      {row.valid ? (
                        <span className="text-green-600 text-xs">ok</span>
                      ) : (
                        <span className="text-red-500 text-xs" title={t("Row will be skipped")}>
                          skip
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {t("{total} total rows in file · {valid} in preview are valid", {
              total: String(totalRows),
              valid: String(validCount),
            })}
          </p>
        </div>

        {importError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {importError}
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
        <button
          type="button"
          onClick={onBack}
          disabled={importMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("Back")}
        </button>
        <button
          type="button"
          onClick={() => importMutation.mutate()}
          disabled={!canImport || importMutation.isPending}
          className="px-5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {importMutation.isPending
            ? t("Importing…")
            : t("Import {count} rows as Drafts", { count: String(totalRows) })}
        </button>
      </div>
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({
  result,
  onClose,
}: {
  result: ImportResult;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="p-4 bg-green-50 rounded-full">
          <FileText className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-800">{t("Import complete")}</h3>
        <p className="text-sm text-gray-600">
          {t("{imported} transaction(s) imported as drafts. {skipped} row(s) skipped.", {
            imported: String(result.imported),
            skipped: String(result.skipped),
          })}
        </p>
        <p className="text-xs text-gray-500">
          {t("Review and approve them in the draft queue.")}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        {t("Done")}
      </button>
    </div>
  );
}

// ── Main wizard component ──────────────────────────────────────────────────────

interface CsvImportWizardProps {
  onClose: () => void;
  onImported: () => void;
}

export function CsvImportWizard({ onClose, onImported }: CsvImportWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<MappingState>({
    dateCol: 0,
    descriptionCol: 1,
    amountCol: 2,
    referenceCol: undefined,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const handlePreview = (path: string, data: CsvPreview) => {
    setFilePath(path);
    setPreview(data);
    // Auto-guess mapping from common header names
    const hdrs = data.headers.map((h) => h.toLowerCase());
    const guess = (patterns: string[]) => {
      for (const p of patterns) {
        const idx = hdrs.findIndex((h) => h.includes(p));
        if (idx !== -1) return idx;
      }
      return undefined;
    };
    setMapping({
      dateCol: guess(["date", "txn", "posted"]) ?? 0,
      descriptionCol: guess(["desc", "memo", "narr", "detail", "name"]) ?? 1,
      amountCol: guess(["amount", "amt", "debit", "credit", "value"]) ?? 2,
      referenceCol: guess(["ref", "check", "id"]),
    });
    setStep(2);
  };

  const handleImported = (result: ImportResult) => {
    setImportResult(result);
    onImported(); // invalidates queries in parent
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-900">{t("Import from CSV")}</h2>
          {!importResult && <StepIndicator step={step} />}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      {importResult ? (
        <SuccessScreen result={importResult} onClose={onClose} />
      ) : step === 1 ? (
        <Step1 onPreview={handlePreview} />
      ) : step === 2 && preview ? (
        <Step2
          preview={preview}
          mapping={mapping}
          onMappingChange={setMapping}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ) : step === 3 && preview && filePath ? (
        <Step3
          filePath={filePath}
          preview={preview}
          mapping={mapping}
          accounts={accounts}
          onBack={() => setStep(2)}
          onImported={handleImported}
        />
      ) : null}
    </div>
  );
}
