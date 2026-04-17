import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Loader, Sparkles, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n";
import type { Account, AccountType, CategorizeSuggestion } from "../../lib/tauri";
import {
  createTransaction,
  listAccounts,
  listDirFiles,
  pickReceiptFiles,
  scanReceipt,
  suggestCategory,
} from "../../lib/tauri";
import { cn, today } from "../../lib/utils";

interface ImportRow {
  id: string;
  include: boolean;
  date: string;
  description: string;
  amount: string;
  txnType: "credit" | "debit";
  categoryAccountId: string;
  suggestion: CategorizeSuggestion | null;
  suggesting: boolean;
}

interface QueueItem {
  id: string;
  path: string;
  name: string;
  status: "pending" | "scanning" | "done" | "error";
  error?: string;
}

interface ImportWizardProps {
  clientId: string;
  onClose: () => void;
  onImported: () => void;
}

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

function AccountDropdown({
  value,
  accounts,
  onChange,
}: {
  value: string;
  accounts: Account[];
  onChange: (id: string) => void;
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
      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
    >
      <option value="">{t("— pick account —")}</option>
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

function QueuePill({ item }: { item: QueueItem }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        item.status === "pending" && "bg-gray-100 text-gray-600",
        item.status === "scanning" && "bg-blue-50 text-blue-700",
        item.status === "done" && "bg-green-50 text-green-700",
        item.status === "error" && "bg-red-50 text-red-700",
      )}
      title={item.error}
    >
      {item.status === "scanning" && <Loader className="w-3 h-3 animate-spin" />}
      {item.status === "done" && <CheckCircle className="w-3 h-3" />}
      {item.status === "error" && <AlertCircle className="w-3 h-3" />}
      {item.name.length > 20 ? `${item.name.slice(0, 18)}…` : item.name}
    </span>
  );
}

function makeRow(description: string, amount: string, date: string): ImportRow {
  return {
    id: crypto.randomUUID(),
    include: true,
    date,
    description,
    amount: amount.replace(/[^0-9.]/g, ""),
    txnType: "credit",
    categoryAccountId: "",
    suggestion: null,
    suggesting: false,
  };
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function ImportWizard({ clientId, onClose, onImported }: ImportWizardProps) {
  const { t } = useI18n();
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", clientId],
    queryFn: () => listAccounts(clientId),
  });
  const assetAccounts = accounts.filter((a) => a.account_type === "asset");

  const [bankAccountId, setBankAccountId] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [suggestingAll, setSuggestingAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const enqueue = useCallback((paths: string[]) => {
    const items: QueueItem[] = paths.map((p) => ({
      id: crypto.randomUUID(),
      path: p,
      name: fileName(p),
      status: "pending" as const,
    }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      const expanded: string[] = [];
      for (const p of paths) {
        const files = await listDirFiles(p);
        expanded.push(...files);
      }
      if (expanded.length > 0) enqueue(expanded);
    },
    [enqueue],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
      getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          const p = event.payload as { type: string; paths?: string[] };
          if (p.type === "enter" || p.type === "over") {
            setDragActive(true);
          } else if (p.type === "drop") {
            setDragActive(false);
            if (p.paths?.length) handleDroppedPaths(p.paths);
          } else {
            setDragActive(false);
          }
        })
        .then((fn) => {
          unlisten = fn;
        });
    });

    return () => {
      unlisten?.();
    };
  }, [handleDroppedPaths]);

  const updateQueue = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q))),
    [],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<ImportRow>) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [],
  );

  useEffect(() => {
    if (scanningId !== null) return;
    const next = queue.find((q) => q.status === "pending");
    if (!next) return;

    setScanningId(next.id);
    updateQueue(next.id, { status: "scanning" });

    (async () => {
      try {
        const result = await scanReceipt(next.path);
        const fallbackDate = result.date ?? today();
        let extracted: ImportRow[] = [];

        if (result.line_items.length > 0) {
          extracted = result.line_items.map((item) =>
            makeRow(item.description, item.amount ?? "0", fallbackDate),
          );
        } else if (result.total) {
          extracted = [makeRow(result.vendor ?? next.name, result.total, fallbackDate)];
        }

        if (extracted.length > 0) setRows((prev) => [...prev, ...extracted]);
        updateQueue(next.id, { status: "done" });
      } catch (err: unknown) {
        updateQueue(next.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setScanningId(null);
      }
    })();
  }, [scanningId, queue, updateQueue]);

  const handlePickFiles = async () => {
    const paths = await pickReceiptFiles();
    if (paths?.length) enqueue(paths);
  };

  const handleSuggestAll = async () => {
    const toSuggest = rows.filter((r) => r.include && !r.suggestion && !r.suggesting);
    if (!toSuggest.length) return;
    setSuggestingAll(true);
    await Promise.allSettled(
      toSuggest.map(async (row) => {
        updateRow(row.id, { suggesting: true });
        try {
          const s = await suggestCategory(row.description, row.amount || "0");
          updateRow(row.id, {
            suggestion: s,
            categoryAccountId: row.categoryAccountId || s.account_id,
            suggesting: false,
          });
        } catch {
          updateRow(row.id, { suggesting: false });
        }
      }),
    );
    setSuggestingAll(false);
  };

  const handleImport = async () => {
    const toImport = rows.filter(
      (r) => r.include && r.categoryAccountId && r.amount && r.date && bankAccountId,
    );
    if (!toImport.length) return;
    setImporting(true);
    setImportError(null);
    let failed = 0;
    for (const row of toImport) {
      const amt = parseFloat(row.amount).toFixed(2);
      const entries =
        row.txnType === "credit"
          ? [
              { account_id: row.categoryAccountId, debit: amt },
              { account_id: bankAccountId, credit: amt },
            ]
          : [
              { account_id: bankAccountId, debit: amt },
              { account_id: row.categoryAccountId, credit: amt },
            ];
      try {
        await createTransaction(
          { txn_date: row.date, description: row.description, entries },
          clientId,
        );
      } catch {
        failed++;
      }
    }
    setImporting(false);
    if (failed === 0) {
      onImported();
    } else {
      setImportError(
        t("{failed} transaction(s) failed. The rest were saved.", { failed: String(failed) }),
      );
    }
  };

  const includedCount = rows.filter((r) => r.include).length;
  const readyCount = rows.filter(
    (r) => r.include && r.categoryAccountId && r.amount && r.date,
  ).length;
  const isScanning = queue.some((q) => q.status === "scanning" || q.status === "pending");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">{t("Import Transactions")}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="shrink-0 flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button
          type="button"
          onClick={handlePickFiles}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 font-medium text-gray-700"
        >
          <Upload className="w-4 h-4" />
          {t("Add Files")}
        </button>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 whitespace-nowrap font-medium">
            {t("Bank Account")}
          </label>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">{t("Select…")}</option>
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>

        {queue.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {queue.map((item) => (
              <QueuePill key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-4 m-5 rounded-xl border-2 border-dashed transition-colors",
            dragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-gray-400",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
        >
          {isScanning ? (
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Loader className="w-8 h-8 animate-spin" />
              <p className="text-sm font-medium">{t("Scanning files…")}</p>
            </div>
          ) : (
            <>
              <Upload className={cn("w-10 h-10", dragActive ? "text-blue-500" : "text-gray-300")} />
              <div className="text-center">
                <p
                  className={cn(
                    "text-sm font-medium",
                    dragActive ? "text-blue-700" : "text-gray-500",
                  )}
                >
                  {dragActive ? t("Drop to scan") : t("Drop files, photos or folders here")}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {t("JPG, PNG, PDF, CSV — or click Add Files above")}
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div
            className={cn(
              "shrink-0 mx-5 mt-3 mb-1 px-4 py-2 rounded-lg border border-dashed text-xs text-center transition-colors cursor-default",
              dragActive
                ? "border-blue-400 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-400 hover:border-gray-300",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
          >
            {isScanning ? (
              <span className="inline-flex items-center gap-1">
                <Loader className="w-3 h-3 animate-spin" /> {t("Scanning…")}
              </span>
            ) : dragActive ? (
              t("Drop to add more files")
            ) : (
              t("Drop more files here to add them")
            )}
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 whitespace-nowrap">{t("Date")}</th>
                  <th className="px-3 py-2">{t("Description")}</th>
                  <th className="px-3 py-2 w-24">{t("Amount")}</th>
                  <th className="px-3 py-2 w-24">{t("Type")}</th>
                  <th className="px-3 py-2">{t("Category Account")}</th>
                  <th className="px-3 py-2 w-24">{t("AI Hint")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn("border-b border-gray-100", !row.include && "opacity-40")}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(row.id, { include: e.target.checked })}
                        className="w-3.5 h-3.5"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.id, { date: e.target.value })}
                        className="px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white w-32"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(row.id, { description: e.target.value })}
                        className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.amount}
                        onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                        className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.txnType}
                        onChange={(e) =>
                          updateRow(row.id, { txnType: e.target.value as "credit" | "debit" })
                        }
                        className="px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:border-blue-500 w-full"
                      >
                        <option value="credit">{t("Credit — outflow")}</option>
                        <option value="debit">{t("Debit — inflow")}</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <AccountDropdown
                        value={row.categoryAccountId}
                        accounts={accounts}
                        onChange={(id) => updateRow(row.id, { categoryAccountId: id })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {row.suggesting ? (
                        <span className="text-gray-400 italic">…</span>
                      ) : row.suggestion ? (
                        <span
                          title={row.suggestion.reason}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-700 cursor-help"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          {row.suggestion.account_name.slice(0, 12)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-gray-200 bg-white flex-wrap">
            <span className="text-xs text-gray-500">
              {t("{count} selected · {ready} ready to import", {
                count: String(includedCount),
                ready: String(readyCount),
              })}
            </span>
            <button
              type="button"
              onClick={handleSuggestAll}
              disabled={suggestingAll || rows.every((r) => r.suggestion || !r.include)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              {suggestingAll ? t("Suggesting…") : t("Suggest Categories")}
            </button>
            {importError && <span className="text-xs text-red-600">{importError}</span>}
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || readyCount === 0 || !bankAccountId}
              className="ml-auto px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              {importing
                ? t("Importing…")
                : t("Import {count} Transaction(s)", { count: String(readyCount) })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
