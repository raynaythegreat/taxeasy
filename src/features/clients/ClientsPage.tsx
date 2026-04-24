import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  FolderSearch,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientWorkspace, type WorkspaceTab } from "../../components/ClientWorkspace";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../lib/i18n";
import { useSidebar } from "../../lib/sidebar";
import type {
  AccountingMethod,
  BulkImportClientFoldersResult,
  Client,
  ClientFolderSyncResult,
  ClientImportProgressEvent,
  CreateClientPayload,
  EntityType,
} from "../../lib/tauri";
import {
  bulkImportClientFolders,
  createClient,
  getActiveClientId,
  listClients,
  onClientImportProgress,
  pickClientFolder,
  pickClientFolders,
  resyncClientFolder,
  setActiveClientPref,
  switchClient,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ClientArchiveConfirm } from "./ClientArchiveConfirm";
import { ClientEditModal } from "./ClientEditModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<EntityType, string> = {
  sole_prop: "Sole Proprietor",
  smllc: "SMLLC",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
  i1040: "1040 Individual",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── New-client form state ─────────────────────────────────────────────────────

interface NewClientForm {
  name: string;
  entity_type: EntityType;
  ein: string;
  source_folder_path: string;
  fiscal_year_start_month: number;
  accounting_method: AccountingMethod;
}

const DEFAULT_FORM: NewClientForm = {
  name: "",
  entity_type: "sole_prop",
  ein: "",
  source_folder_path: "",
  fiscal_year_start_month: 1,
  accounting_method: "cash",
};

type FilingStatus = "not_started" | "in_progress" | "filed" | "accepted";

type ImportNotice =
  | {
      type: "success" | "error";
      operation: "bulk_import" | "resync";
      result: BulkImportClientFoldersResult;
    }
  | {
      type: "success" | "error";
      operation: "resync";
      result: ClientFolderSyncResult;
    }
  | {
      type: "error";
      operation: "bulk_import" | "resync";
      message: string;
    };

interface ImportProgressState {
  operation: "bulk_import" | "resync";
  clientId?: string;
  clientName?: string;
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
  importedCount?: number;
  skippedCount?: number;
  dedupedCount?: number;
  failedCount?: number;
}

interface RecentImport {
  id: string;
  name: string;
  entityType: EntityType;
  importedAt: number;
}

function getRecentImports(): RecentImport[] {
  try {
    const stored = localStorage.getItem("recent_imports");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentImport(client: { id: string; name: string; entityType: EntityType }) {
  const recent = getRecentImports();
  const updated = [
    { ...client, importedAt: Date.now() },
    ...recent.filter((r) => r.id !== client.id),
  ].slice(0, 3);
  localStorage.setItem("recent_imports", JSON.stringify(updated));
}

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  filed: "Filed",
  accepted: "Accepted",
};

const FILING_STATUS_COLORS: Record<FilingStatus, string> = {
  not_started: "bg-gray-100 text-gray-500",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  filed: "bg-blue-50 text-blue-700 border border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function EntityBadge({ type }: { type: EntityType }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      {t(ENTITY_LABELS[type])}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-5 h-5 text-blue-600"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function formatImportSummary(
  t: (key: string, vars?: Record<string, string>) => string,
  result: BulkImportClientFoldersResult,
) {
  const counts = getBulkResultCounts(result);

  return t(
    "{created} created, {skipped} skipped, {failed} failed, {documents} documents imported, {deduped} deduped, {documentSkips} document skips",
    {
      created: String(counts.created),
      skipped: String(counts.skipped),
      failed: String(counts.failed),
      documents: String(counts.importedDocuments),
      deduped: String(counts.dedupedDocuments),
      documentSkips: String(counts.skippedDocuments),
    },
  );
}

function getBulkResultCounts(result: BulkImportClientFoldersResult) {
  return {
    created: result.createdCount ?? result.created.length,
    skipped: result.skippedCount ?? result.skipped.length,
    failed: result.failedCount ?? result.failed.length,
    importedDocuments:
      result.importedDocumentCount ??
      result.created.reduce((total, entry) => total + entry.importedDocumentCount, 0),
    skippedDocuments:
      result.skippedDocumentCount ??
      result.created.reduce(
        (total, entry) =>
          total + (entry.skippedDocumentCount ?? entry.skippedDocuments?.length ?? 0),
        0,
      ),
    dedupedDocuments:
      result.dedupedDocumentCount ??
      result.created.reduce((total, entry) => total + (entry.dedupedDocumentCount ?? 0), 0),
  };
}

function getResyncResultCounts(result: ClientFolderSyncResult) {
  return {
    importedDocuments: result.importedDocumentCount ?? result.importedDocuments?.length ?? 0,
    skippedDocuments: result.skippedDocumentCount ?? result.skippedDocuments?.length ?? 0,
    dedupedDocuments: result.dedupedDocumentCount ?? result.duplicateDocumentCount ?? 0,
    failedDocuments: result.failedDocumentCount ?? result.failedDocuments?.length ?? 0,
  };
}

function formatResyncSummary(
  t: (key: string, vars?: Record<string, string>) => string,
  result: ClientFolderSyncResult,
) {
  const counts = getResyncResultCounts(result);

  return t(
    "{documents} imported, {deduped} deduped, {documentSkips} document skips, {failed} failed",
    {
      documents: String(counts.importedDocuments),
      deduped: String(counts.dedupedDocuments),
      documentSkips: String(counts.skippedDocuments),
      failed: String(counts.failedDocuments),
    },
  );
}

function formatProgressMessage(
  t: (key: string, vars?: Record<string, string>) => string,
  progress: ImportProgressState,
) {
  if (progress.message) {
    return progress.message;
  }

  if (progress.clientName) {
    return t("Working on {client}", { client: progress.clientName });
  }

  return progress.operation === "resync" ? t("Re-syncing folder…") : t("Importing folders…");
}

function getProgressPercent(progress: ImportProgressState) {
  if (typeof progress.percent === "number") {
    return Math.max(0, Math.min(100, progress.percent));
  }

  if (
    typeof progress.current === "number" &&
    typeof progress.total === "number" &&
    progress.total > 0
  ) {
    return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)));
  }

  return null;
}

function ProgressPanel({
  t,
  progress,
}: {
  t: (key: string, vars?: Record<string, string>) => string;
  progress: ImportProgressState;
}) {
  const percent = getProgressPercent(progress);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-xl border border-blue-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex items-start gap-3">
        <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {progress.operation === "resync" ? t("Re-syncing folder") : t("Importing folders")}
          </p>
          <p className="mt-1 text-sm text-gray-600">{formatProgressMessage(t, progress)}</p>
          {percent !== null && (
            <div className="mt-3 h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            {typeof progress.current === "number" && typeof progress.total === "number" && (
              <span>
                {t("{current} of {total}", {
                  current: String(progress.current),
                  total: String(progress.total),
                })}
              </span>
            )}
            {typeof progress.importedCount === "number" && (
              <span>{t("{count} imported", { count: String(progress.importedCount) })}</span>
            )}
            {typeof progress.dedupedCount === "number" && (
              <span>{t("{count} deduped", { count: String(progress.dedupedCount) })}</span>
            )}
            {typeof progress.skippedCount === "number" && (
              <span>{t("{count} skipped", { count: String(progress.skippedCount) })}</span>
            )}
            {typeof progress.failedCount === "number" && (
              <span>{t("{count} failed", { count: String(progress.failedCount) })}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function hasResult(
  notice: ImportNotice,
): notice is Extract<
  ImportNotice,
  { result: BulkImportClientFoldersResult | ClientFolderSyncResult }
> {
  return "result" in notice;
}

function isBulkImportNotice(
  notice: ImportNotice,
): notice is Extract<ImportNotice, { result: BulkImportClientFoldersResult }> {
  return hasResult(notice) && "created" in notice.result;
}

function ImportResultPanel({
  t,
  notice,
  onDismiss,
}: {
  t: (key: string, vars?: Record<string, string>) => string;
  notice: ImportNotice;
  onDismiss: () => void;
}) {
  const isBulkResult = isBulkImportNotice(notice);

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-full max-w-lg rounded-xl border px-4 py-3 shadow-lg",
        notice.type === "success"
          ? "border-green-200 bg-green-50 text-green-950"
          : "border-red-200 bg-red-50 text-red-950",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {notice.operation === "resync"
              ? notice.type === "success"
                ? t("Folder re-sync complete")
                : t("Folder re-sync failed")
              : notice.type === "success"
                ? t("Folder import complete")
                : t("Folder import failed")}
          </p>
          <p className="mt-1 text-sm">
            {hasResult(notice)
              ? isBulkResult
                ? formatImportSummary(t, notice.result)
                : formatResyncSummary(t, notice.result)
              : notice.message}
          </p>
          {isBulkResult && (
            <div className="mt-3 space-y-2 text-xs text-current/80">
              {notice.result.created.length > 0 && (
                <div>
                  <p className="font-semibold">{t("Created clients")}</p>
                  <ul className="mt-1 space-y-1">
                    {notice.result.created.slice(0, 4).map((entry) => (
                      <li key={entry.client.id}>
                        {entry.client.name}:{" "}
                        {t("{count} imported", { count: String(entry.importedDocumentCount) })}
                        {(entry.dedupedDocumentCount ?? 0) > 0
                          ? `, ${t("{count} deduped", { count: String(entry.dedupedDocumentCount) })}`
                          : ""}
                        {(entry.skippedDocumentCount ?? 0) > 0
                          ? `, ${t("{count} skipped", { count: String(entry.skippedDocumentCount) })}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {notice.result.skipped.length > 0 && (
                <div>
                  <p className="font-semibold">{t("Skipped folders")}</p>
                  <ul className="mt-1 space-y-1">
                    {notice.result.skipped.slice(0, 3).map((entry) => (
                      <li key={`${entry.folderPath}:${entry.reason}`}>
                        {entry.clientName}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {notice.result.failed.length > 0 && (
                <div>
                  <p className="font-semibold">{t("Failed folders")}</p>
                  <ul className="mt-1 space-y-1">
                    {notice.result.failed.slice(0, 3).map((entry) => (
                      <li key={`${entry.folderPath}:${entry.reason}`}>
                        {entry.clientName ?? entry.folderPath}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {hasResult(notice) && !isBulkResult && (
            <div className="mt-3 space-y-2 text-xs text-current/80">
              {notice.result.sourceFolderPath && <p>{notice.result.sourceFolderPath}</p>}
              {(notice.result.warnings?.length ?? 0) > 0 && (
                <ul className="space-y-1">
                  {notice.result.warnings?.slice(0, 3).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 text-current/70 hover:bg-black/5 hover:text-current"
          aria-label={t("Dismiss")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientsPage({
  initialClientId,
  initialTab,
  onBack,
  autoShowForm: autoShowFormProp,
}: {
  initialClientId?: string | null;
  initialTab?: WorkspaceTab;
  onBack: () => void;
  autoShowForm?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewClientForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [archivingClient, setArchivingClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const CLIENT_TEMPLATES: { label: string; entity_type: EntityType; accounting_method: AccountingMethod }[] = [
    { label: "Sole Proprietor", entity_type: "sole_prop", accounting_method: "cash" },
    { label: "SMLLC", entity_type: "smllc", accounting_method: "cash" },
    { label: "S-Corp", entity_type: "scorp", accounting_method: "accrual" },
  ];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setShowForm(true);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 50);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  const [filingStatuses, setFilingStatuses] = useState<Record<string, FilingStatus>>(() => {
    try {
      const stored = localStorage.getItem("filing_statuses");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const updateFilingStatus = useCallback((clientId: string, status: FilingStatus) => {
    setFilingStatuses((prev) => {
      const next = { ...prev, [clientId]: status };
      localStorage.setItem("filing_statuses", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    if (initialClientId) {
      switchClient(initialClientId)
        .then(() => {
          setActiveClientId(initialClientId);
        })
        .catch(() => {});
    } else {
      getActiveClientId()
        .then((id) => {
          if (id) {
            switchClient(id)
              .then(() => {
                setActiveClientId(id);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [initialized, initialClientId]);

  useEffect(() => {
    if (autoShowFormProp) {
      setShowForm(true);
    }
  }, [autoShowFormProp]);

  useEffect(() => {
    if (!activeClientId && !showForm && !initialized) {
      setShowForm(true);
    }
  }, [activeClientId, showForm, initialized]);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    onClientImportProgress((event: ClientImportProgressEvent) => {
      if (!mounted) {
        return;
      }

      setImportProgress((current) => ({
        operation: event.operation === "resync" ? "resync" : (current?.operation ?? "bulk_import"),
        clientId: event.clientId ?? current?.clientId,
        clientName: event.clientName ?? current?.clientName,
        current: event.current ?? current?.current,
        total: event.total ?? current?.total,
        percent: event.percent ?? current?.percent,
        message: event.message ?? current?.message,
        importedCount:
          event.importedCount ?? event.importedDocumentCount ?? current?.importedCount,
        skippedCount: event.skippedCount ?? current?.skippedCount,
        dedupedCount:
          event.dedupedCount ?? event.duplicateDocumentCount ?? current?.dedupedCount,
        failedCount: event.failedCount ?? current?.failedCount,
      }));
    })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch(() => {});

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  // Query: list clients
  const {
    data: clients,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

   const filteredClients = useMemo(() => {
     if (!clients) return [];
     if (!searchQuery.trim()) return clients;
     const q = searchQuery.toLowerCase().trim();
     return clients.filter((c: Client) => c.name.toLowerCase().includes(q));
   }, [clients, searchQuery]);

   // Handle client switch
  async function handleSwitchClient(clientId: string) {
    setSwitchError(null);
    try {
      await switchClient(clientId);
      setActiveClientId(clientId);
      setActiveClientPref(clientId).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSwitchError(`Could not switch client: ${msg}`);
    }
  }

  // Mutation: create client
  const createMutation = useMutation({
    mutationFn: (payload: CreateClientPayload) => createClient(payload),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setFormError(null);
      handleSwitchClient(newClient.id);
      void syncNewClientSourceFolder(newClient);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to create client: ${msg}`);
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: (folderPaths: string[]) => bulkImportClientFolders(folderPaths),
    onMutate: (folderPaths) => {
      setImportProgress({ operation: "bulk_import", current: 0, total: folderPaths.length });
      setImportNotice(null);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setImportProgress(null);
      result.created.forEach((entry) => {
        addRecentImport({
          id: entry.client.id,
          name: entry.client.name,
          entityType: entry.client.entity_type,
        });
      });
      setImportNotice({
        type: result.failed.length > 0 ? "error" : "success",
        operation: "bulk_import",
        result,
      });
    },
    onError: (err: unknown) => {
      setImportProgress(null);
      const msg = err instanceof Error ? err.message : String(err);
      setImportNotice({
        type: "error",
        operation: "bulk_import",
        message: `${t("Folder import failed")}: ${msg}`,
      });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (client: Client) => {
      if (!client.source_folder_path) {
        throw new Error(t("No source folder saved"));
      }

      return { client, result: await resyncClientFolder(client.id) };
    },
    onMutate: (client) => {
      setImportProgress({
        operation: "resync",
        clientId: client.id,
        clientName: client.name,
        current: 0,
        total: 1,
      });
      setImportNotice(null);
    },
    onSuccess: ({ client, result }) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setImportProgress(null);
      setImportNotice({
        type:
          (result.failedDocumentCount ?? result.failedDocuments?.length ?? 0) > 0
            ? "error"
            : "success",
        operation: "resync",
        result: {
          ...result,
          clientId: result.clientId || client.id,
          clientName: result.clientName || result.client?.name || client.name,
          sourceFolderPath: result.sourceFolderPath || client.source_folder_path || "",
        },
      });
    },
    onError: (err: unknown) => {
      setImportProgress(null);
      const msg = err instanceof Error ? err.message : String(err);
      setImportNotice({
        type: "error",
        operation: "resync",
        message: `${t("Folder re-sync failed")}: ${msg}`,
      });
    },
  });

    // Handle drag-and-drop for folder import
    const handleImportFoldersFromPaths = useCallback(async (folderPaths: string[]) => {
      if (folderPaths.length === 0) return;
      try {
        setImportNotice(null);
        await bulkImportMutation.mutateAsync(folderPaths);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["clients"] });
        }, 150);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setImportNotice({
          type: "error",
          operation: "bulk_import",
          message: `${t("Folder import failed")}: ${msg}`,
        });
      }
    }, [bulkImportMutation, t, queryClient]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedPaths = Array.from(e.dataTransfer.files)
        .map((file: File) => (file as any).path) // Tauri adds .path property to File
        .filter((path: unknown): path is string => typeof path === "string" && path.length > 0);
      if (droppedPaths.length === 0) {
        // Fallback: try text/uri-list
        const uri = e.dataTransfer.getData("text/uri-list");
        if (uri) {
          const paths = uri.split("\n").filter(Boolean);
          if (paths.length > 0) {
            handleImportFoldersFromPaths(paths);
            return;
          }
        }
        return;
       }
       handleImportFoldersFromPaths(droppedPaths);
     }, [handleImportFoldersFromPaths]);

   function updateField<K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  // Handle form submission
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError(t("Business name is required."));
      return;
    }

    const payload: CreateClientPayload = {
      name: trimmedName,
      entity_type: form.entity_type,
      fiscal_year_start_month: form.fiscal_year_start_month,
      accounting_method: form.accounting_method,
    };

    const trimmedEin = form.ein.trim();
    if (trimmedEin) {
      payload.ein = trimmedEin;
    }

    const trimmedSourceFolderPath = form.source_folder_path.trim();
    if (trimmedSourceFolderPath) {
      payload.source_folder_path = trimmedSourceFolderPath;
    }

    createMutation.mutate(payload);
  }

  function handleCancelForm() {
    setShowForm(false);
    setForm(DEFAULT_FORM);
    setFormError(null);
  }

  async function handleImportFolders() {
    try {
      const folders = await pickClientFolders();
      if (!folders || folders.length === 0) {
        return;
      }
      console.log("[Import] Selected folders:", folders.length, folders);
      setImportNotice(null);
      await bulkImportMutation.mutateAsync(folders);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportNotice(
        (current) =>
          current ?? {
            type: "error",
            operation: "bulk_import",
            message: `${t("Folder import failed")}: ${msg}`,
          },
      );
    }
  }

  async function handlePickSourceFolder() {
    const folder = await pickClientFolder();
    if (folder) {
      updateField("source_folder_path", folder);
    }
  }

  async function syncNewClientSourceFolder(client: Client) {
    if (!client.source_folder_path) {
      return;
    }

    setImportProgress({
      operation: "resync",
      clientId: client.id,
      clientName: client.name,
      current: 0,
      total: 1,
      message: t("Importing source folder…"),
    });
    setImportNotice(null);

    try {
      const result = await resyncClientFolder(client.id);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setImportNotice({
        type:
          (result.failedDocumentCount ?? result.failedDocuments?.length ?? 0) > 0
            ? "error"
            : "success",
        operation: "resync",
        result: {
          ...result,
          clientId: result.clientId || client.id,
          clientName: result.clientName || result.client?.name || client.name,
          sourceFolderPath: result.sourceFolderPath || client.source_folder_path,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportNotice({
        type: "error",
        operation: "resync",
        message: `${t("Folder re-sync failed")}: ${msg}`,
      });
    } finally {
      setImportProgress(null);
    }
  }

  async function handleResyncClient(client: Client) {
    setImportNotice(null);
    await resyncMutation.mutateAsync(client);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();

   return (
     <section
       className="flex h-full min-h-0 overflow-hidden relative"
       onDragOver={handleDragOver}
       onDragLeave={handleDragLeave}
       onDrop={handleDrop}
       aria-label={t("Client list")}
     >
       {isDragging && (
         <div
           className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 flex items-center justify-center"
           style={{ pointerEvents: "none" }}
         >
           <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-center">
             <FolderSearch className="w-12 h-12 text-blue-500 mx-auto mb-2" />
             <p className="text-sm font-semibold text-gray-900">Drop folders to import clients</p>
             <p className="text-xs text-gray-500">Each folder becomes a new client</p>
           </div>
         </div>
       )}
      {/* Sidebar */}
      <div
        className={cn(
          "relative h-full min-h-0 flex-shrink-0 transition-[width] duration-200 print:hidden",
          sidebarCollapsed ? "w-16" : "w-72",
        )}
      >
      <aside className="h-full min-h-0 w-full overflow-hidden bg-white border-r border-gray-200 flex flex-col">
        {/* Sidebar header — expanded */}
        {!sidebarCollapsed && (
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors group"
                title={t("Back to Dashboard")}
                aria-label={t("Back to Dashboard")}
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-medium">{t("Back")}</span>
              </button>
            </div>
            <div className="space-y-3">
              <h2 className="text-base font-bold text-gray-900">{t("Clients")}</h2>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button
                  type="button"
                  onClick={handleImportFolders}
                  disabled={bulkImportMutation.isPending || resyncMutation.isPending}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                    bulkImportMutation.isPending || resyncMutation.isPending
                      ? "border-gray-200 bg-gray-100 text-gray-400 cursor-wait"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <FolderSearch className="w-3.5 h-3.5" />
                  {bulkImportMutation.isPending ? t("Importing…") : t("Import Folders")}
                </button>
                {!showForm && (
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex shrink-0 items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t("New")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sidebar header — collapsed */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-2 pt-4 pb-2">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={t("Back to Dashboard")}
              aria-label={t("Back to Dashboard")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleImportFolders}
              disabled={bulkImportMutation.isPending || resyncMutation.isPending}
              className={cn(
                "p-2 rounded-lg transition-colors",
                bulkImportMutation.isPending || resyncMutation.isPending
                  ? "bg-gray-100 text-gray-300 cursor-wait"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              )}
              title={bulkImportMutation.isPending ? t("Importing…") : t("Import Folders")}
              aria-label={bulkImportMutation.isPending ? t("Importing…") : t("Import Folders")}
            >
              <FolderSearch className="w-4 h-4" />
            </button>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title={t("New Client")}
                aria-label={t("New Client")}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Switch error */}
        {switchError && !sidebarCollapsed && (
          <div
            role="alert"
            className="mx-4 mt-1 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {switchError}
          </div>
        )}

        {/* Search bar */}
        {!sidebarCollapsed && !isLoading && clients && clients.length > 0 && (
          <div className="px-4 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search clients…")}
                className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        {!sidebarCollapsed && <div className="mx-4 mt-2 border-t border-gray-100" />}

        {/* Client list */}
        <div
          className={cn("flex-1 min-h-0 overflow-y-auto pb-1", sidebarCollapsed ? "pt-1" : "pt-1")}
        >
          {isLoading && (
            <div className="px-3 py-2 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 rounded bg-gray-200 w-3/4" />
                    <div className="h-3 rounded bg-gray-100 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div
              role="alert"
              className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {fetchError instanceof Error ? fetchError.message : t("Failed to load clients.")}
            </div>
          )}

          {!isLoading && !isError && clients && clients.length === 0 && (
            <div className="px-3 py-4">
              <EmptyState
                icon={<Users className="w-6 h-6" />}
                title={t("No clients yet")}
                description={t("Create your first client to get started.")}
                action={{ label: t("New Client"), onClick: () => setShowForm(true) }}
              />
            </div>
          )}

          {!isLoading && clients && clients.length > 0 && filteredClients.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t("No clients match your search.")}
            </div>
          )}

          {!isLoading && clients && clients.length > 0 && (
            <ul className="flex flex-col gap-2 px-3">
              {filteredClients.map((client) => {
                const isActive = client.id === activeClientId;
                const initials =
                  client.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?";
                const filingStatus = filingStatuses[client.id] ?? "not_started";
                if (sidebarCollapsed) {
                  return (
                    <li key={client.id} className="flex justify-center py-1">
                      <button
                        type="button"
                        onClick={() => handleSwitchClient(client.id)}
                        className={cn(
                          "flex items-center justify-center p-1.5 rounded-lg transition-colors focus:outline-none relative",
                          isActive ? "bg-blue-100" : "hover:bg-gray-100",
                        )}
                        title={client.name}
                        aria-label={client.name}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
                            isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700",
                          )}
                        >
                          {initials}
                        </span>
                        {filingStatus !== "not_started" && (
                          <span
                            className={cn(
                              "absolute bottom-1.5 right-1/2 translate-x-[14px] w-2 h-2 rounded-full",
                              filingStatus === "accepted"
                                ? "bg-emerald-500"
                                : filingStatus === "filed"
                                  ? "bg-blue-500"
                                  : "bg-amber-500",
                            )}
                          />
                        )}
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={client.id} className="group">
                    <div
                      className={cn(
                        "flex min-w-0 items-center rounded-lg transition-colors hover:bg-gray-50 focus-within:bg-gray-50",
                        isActive ? "bg-blue-50 ring-1 ring-blue-200" : "",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchClient(client.id)}
                        className="min-w-0 flex-1 px-3 py-2 text-left focus:outline-none"
                        aria-current={isActive ? "true" : undefined}
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 truncate text-sm font-medium",
                                isActive
                                  ? "text-blue-700 dark:text-blue-400"
                                  : "text-gray-800 dark:text-gray-100",
                              )}
                              title={client.name}
                            >
                              {client.name}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 inline-flex items-center rounded px-1.5 py-0 text-[10px] font-semibold leading-4",
                                FILING_STATUS_COLORS[filingStatus],
                              )}
                            >
                              {t(FILING_STATUS_LABELS[filingStatus])}
                            </span>
                          </div>
                          <EntityBadge type={client.entity_type} />
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => setEditingClient(client)}
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          title={t("Edit client")}
                          aria-label={t("Edit client")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleResyncClient(client).catch(() => {});
                          }}
                          disabled={resyncMutation.isPending || !client.source_folder_path}
                          className="rounded p-1 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            client.source_folder_path
                              ? t("Re-sync Folder")
                              : t("No source folder saved")
                          }
                          aria-label={
                            client.source_folder_path
                              ? t("Re-sync Folder")
                              : t("No source folder saved")
                          }
                        >
                          <RefreshCw
                            className={cn(
                              "w-3.5 h-3.5",
                              resyncMutation.isPending && resyncMutation.variables?.id === client.id
                                ? "animate-spin"
                                : "",
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next: Record<FilingStatus, FilingStatus> = {
                              not_started: "in_progress",
                              in_progress: "filed",
                              filed: "accepted",
                              accepted: "not_started",
                            };
                            updateFilingStatus(client.id, next[filingStatus]);
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          title={t("Change filing status")}
                          aria-label={t("Change filing status")}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchivingClient(client)}
                          className="rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          title={t("Archive client")}
                          aria-label={t("Archive client")}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      </div>

      {/* Collapse toggle — anchored to the expanded sidebar edge, stays fixed */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "absolute top-6 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-md transition-all duration-200 hover:border-gray-400 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
          sidebarCollapsed ? "left-14" : "left-[276px]",
        )}
        title={sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
        aria-label={sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
        aria-expanded={!sidebarCollapsed}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>

      {/* Main content area */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {showForm ? (
          /* ── New Client Form ── */
          <div className="h-full overflow-auto">
            <div className="p-6 max-w-lg">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">{t("New Client")}</h2>

              <form
                onSubmit={handleSubmit}
                noValidate
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
              >
              {/* Client Type Toggle */}
              <div>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateField("entity_type", "i1040")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                        form.entity_type === "i1040"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50",
                      )}
                      disabled={createMutation.isPending}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      {t("Individual (1040)")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (form.entity_type === "i1040") updateField("entity_type", "sole_prop");
                      }}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-300",
                        form.entity_type !== "i1040"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50",
                      )}
                      disabled={createMutation.isPending}
                      aria-label={t("Business")}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                      {t("Business")}
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label
                    htmlFor="client-name"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    {form.entity_type === "i1040" ? t("Client Name") : t("Business Name")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="client-name"
                    type="text"
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateField("name", e.target.value)
                    }
                    placeholder={form.entity_type === "i1040" ? "John Doe" : "Acme Consulting LLC"}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    disabled={createMutation.isPending}
                  />
                </div>

                {/* Entity Type — only shown for Business */}
                {form.entity_type !== "i1040" && (
                  <div>
                    <label
                      htmlFor="entity-type"
                      className="block text-sm font-medium text-gray-700 mb-1.5"
                    >
                      {t("Entity Type")}
                    </label>
                    <select
                      id="entity-type"
                      value={form.entity_type}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        updateField("entity_type", e.target.value as EntityType)
                      }
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      disabled={createMutation.isPending}
                    >
                      <option value="sole_prop">{t("Sole Proprietor")}</option>
                      <option value="smllc">SMLLC</option>
                      <option value="scorp">S-Corp</option>
                      <option value="ccorp">C-Corp</option>
                      <option value="partnership">{t("Partnership")}</option>
                    </select>
                  </div>
                )}

                {/* SSN / EIN */}
                <div>
                  <label htmlFor="ein" className="block text-sm font-medium text-gray-700 mb-1.5">
                    {form.entity_type === "i1040" ? t("SSN") : t("EIN")}{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="ein"
                    type="text"
                    value={form.ein}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                      let formatted: string;
                      if (form.entity_type === "i1040") {
                        if (digits.length > 5)
                          formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
                        else if (digits.length > 3)
                          formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                        else formatted = digits;
                      } else {
                        formatted =
                          digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
                      }
                      updateField("ein", formatted);
                    }}
                    placeholder={form.entity_type === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                    maxLength={form.entity_type === "i1040" ? 11 : 10}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    disabled={createMutation.isPending}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Format: {form.entity_type === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                  </p>
                </div>

                {/* Source Folder */}
                <div>
                  <label
                    htmlFor="client-source-folder-path"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    {t("Source Folder Path")}{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <input
                      id="client-source-folder-path"
                      type="text"
                      value={form.source_folder_path}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        updateField("source_folder_path", e.target.value)
                      }
                      placeholder={t("No source folder saved")}
                      className="min-w-0 flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      disabled={createMutation.isPending}
                    />
                    <button
                      type="button"
                      onClick={handlePickSourceFolder}
                      disabled={createMutation.isPending}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderSearch className="h-4 w-4" />
                      {t("Choose Folder")}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {t("Used for client document imports and future re-syncs.")}
                  </p>
                </div>

                {/* Fiscal Year Start */}
                <div>
                  <label
                    htmlFor="fiscal-year-start"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    {t("Fiscal Year Start")}
                  </label>
                  <select
                    id="fiscal-year-start"
                    value={form.fiscal_year_start_month}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      updateField("fiscal_year_start_month", Number(e.target.value))
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    disabled={createMutation.isPending}
                  >
                    {MONTHS.map((month, idx) => (
                      <option key={month} value={idx + 1}>
                        {t(month)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Accounting Method */}
                <div>
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-2">
                      {t("Accounting Method")}
                    </legend>
                    <div className="flex gap-6">
                      {(["cash", "accrual"] as AccountingMethod[]).map((method) => (
                        <label key={method} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="accounting-method"
                            value={method}
                            checked={form.accounting_method === method}
                            onChange={() => updateField("accounting_method", method)}
                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                            disabled={createMutation.isPending}
                          />
                          <span className="text-sm text-gray-700">
                            {method === "cash" ? t("Cash") : t("Accrual")}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                {/* Form error */}
                {formError && (
                  <div
                    role="alert"
                    className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                  >
                    {formError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {createMutation.isPending ? (
                        <>
                          <Spinner />
                          {t("Creating…")}
                        </>
                      ) : (
                        t("Create Client")
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelForm}
                      disabled={createMutation.isPending}
                      className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportFolders}
                    disabled={bulkImportMutation.isPending || resyncMutation.isPending}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                      bulkImportMutation.isPending || resyncMutation.isPending
                        ? "border-gray-200 bg-gray-100 text-gray-400 cursor-wait"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    <FolderSearch className="w-4 h-4" />
                    {bulkImportMutation.isPending ? t("Importing…") : t("Import Folders")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : activeClientId && clients?.find((c) => c.id === activeClientId) ? (
          <ClientWorkspace
            client={clients.find((c) => c.id === activeClientId) ?? clients[0]}
            initialTab={initialTab}
          />
        ) : (
          /* ── No client selected — show create form + drop zone ── */
          <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <div className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-2xl space-y-5">
                {/* Header */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 mb-3">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Welcome to Taxeasy</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Select a client or create a new one
                  </p>
                </div>

                {/* Existing Clients */}
                {clients && clients.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        {t("Existing Clients")} ({clients.length})
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForm(true);
                          setTimeout(() => nameInputRef.current?.focus(), 50);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        + {t("New Client")}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-[320px] overflow-auto pr-1">
                      {clients.map((client) => {
                        const filingStatus = filingStatuses[client.id] || "not_started";
                        const initials = client.name
                          .split(/\s+/)
                          .map((w) => w[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "?";
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={async () => {
                              await handleSwitchClient(client.id);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left"
                          >
                            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-sm">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {client.name}
                                </p>
                                <EntityBadge type={client.entity_type} />
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded px-1.5 py-0 text-[10px] font-semibold leading-4",
                                    FILING_STATUS_COLORS[filingStatus],
                                  )}
                                >
                                  {t(FILING_STATUS_LABELS[filingStatus])}
                                </span>
                                {client.ein && (
                                  <span className="text-[10px] text-gray-400 font-mono">
                                    EIN: ••••{client.ein.slice(-4)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Divider */}
                {clients && clients.length > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      or add a new client
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}

                {/* Drop Zone */}
                {importProgress && importProgress.operation === "bulk_import" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                      <LoaderCircle className="mt-0.5 h-5 w-5 animate-spin text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {t("Importing folders")}
                        </p>
                        {importProgress.clientName && (
                          <p className="mt-1 text-sm text-gray-600">
                            {t("Processing {client}", { client: importProgress.clientName })}
                          </p>
                        )}
                        {getProgressPercent(importProgress) !== null && (
                          <div className="mt-3 h-2 rounded-full bg-gray-100">
                            <div
                              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${getProgressPercent(importProgress)}%` }}
                            />
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          {typeof importProgress.current === "number" &&
                            typeof importProgress.total === "number" && (
                              <span>
                                {t("{current} of {total}", {
                                  current: String(importProgress.current),
                                  total: String(importProgress.total),
                                })}
                              </span>
                            )}
                          {typeof importProgress.importedCount === "number" && (
                            <span>
                              {t("{count} imported", {
                                count: String(importProgress.importedCount),
                              })}
                            </span>
                          )}
                          {typeof importProgress.skippedCount === "number" && (
                            <span>
                              {t("{count} skipped", {
                                count: String(importProgress.skippedCount),
                              })}
                            </span>
                          )}
                          {typeof importProgress.failedCount === "number" && (
                            <span>
                              {t("{count} failed", {
                                count: String(importProgress.failedCount),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <section
                  className={cn(
                    "rounded-xl border-2 border-dashed p-6 transition-all",
                    isDragging
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-gray-300 bg-white hover:border-gray-400",
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  aria-label="Drop zone for folder import"
                >
                  {isDragging ? (
                    <div className="text-center py-4">
                      <FolderSearch className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-gray-900">
                        Drop folders to import clients
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Each folder becomes a new client with all its files
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <FolderSearch className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-600">
                        Drag &amp; drop client folders here
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Or create a client manually below
                      </p>
                      <button
                        type="button"
                        onClick={handleImportFolders}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        {t("Browse Folders")}
                      </button>
                    </div>
                  )}
                </section>

                {/* Client Type Toggle */}
                <div>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateField("entity_type", "i1040")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                      form.entity_type === "i1040"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    )}
                    disabled={createMutation.isPending}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    {t("Individual (1040)")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (form.entity_type === "i1040") updateField("entity_type", "sole_prop");
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-300",
                      form.entity_type !== "i1040"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    )}
                    disabled={createMutation.isPending}
                    aria-label={t("Business")}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    {t("Business")}
                  </button>
                </div>
              </div>

              {/* Template Buttons */}
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-500 mb-2">{t("Create from Template")}</p>
                <div className="flex gap-2">
                  {CLIENT_TEMPLATES.map((template) => (
                    <button
                      key={template.entity_type}
                      type="button"
                      onClick={() => {
                        updateField("entity_type", template.entity_type);
                        updateField("accounting_method", template.accounting_method);
                        updateField("name", `${template.label} — `);
                        nameInputRef.current?.focus();
                      }}
                      disabled={createMutation.isPending}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="mt-4">
                <label
                  htmlFor="welcome-client-name"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {form.entity_type === "i1040" ? t("Full Name") : t("Business Name")}{" "}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  id="welcome-client-name"
                  type="text"
                  value={form.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField("name", e.target.value)
                  }
                  placeholder={
                    form.entity_type === "i1040" ? "John Doe" : "Acme Consulting LLC"
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
              </div>

              {/* SSN / EIN */}
              <div className="mt-4">
                <label
                  htmlFor="welcome-ein"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {form.entity_type === "i1040" ? t("SSN") : t("EIN")}{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="welcome-ein"
                  type="text"
                  value={form.ein}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    let formatted: string;
                    if (form.entity_type === "i1040") {
                      if (digits.length > 5)
                        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}${digits.length > 5 ? `-${digits.slice(5)}` : ""}`;
                      else if (digits.length > 3)
                        formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                      else formatted = digits;
                    } else {
                      formatted =
                        digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
                    }
                    updateField("ein", formatted);
                  }}
                  placeholder={form.entity_type === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                  maxLength={form.entity_type === "i1040" ? 11 : 10}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
              </div>

              {formError && (
                <div
                  role="alert"
                  className="mt-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    const trimmedName = form.name.trim();
                    if (!trimmedName) {
                      setFormError(t("Business name is required."));
                      return;
                    }
                    const payload: CreateClientPayload = {
                      name: trimmedName,
                      entity_type: form.entity_type,
                      fiscal_year_start_month: form.fiscal_year_start_month,
                      accounting_method: form.accounting_method,
                    };
                    const trimmedEin = form.ein.trim();
                    if (trimmedEin) {
                      payload.ein = trimmedEin;
                    }
                    const trimmedSourceFolderPath = form.source_folder_path.trim();
                    if (trimmedSourceFolderPath) {
                      payload.source_folder_path = trimmedSourceFolderPath;
                    }
                    createMutation.mutate(payload);
                  }}
                  disabled={createMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createMutation.isPending ? (
                    <>
                      <Spinner />
                      {t("Creating…")}
                    </>
                  ) : (
                    t("Create Client")
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  disabled={createMutation.isPending}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>

      {/* Drag-and-drop overlay for new client form */}
      {showForm && isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg px-6 py-4 text-center">
            <FolderSearch className="w-12 h-12 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900">Drop folders to import clients</p>
            <p className="text-xs text-gray-500">Each folder becomes a new client</p>
          </div>
        </div>
      )}

      {editingClient && (
        <ClientEditModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => setEditingClient(null)}
        />
      )}

      {archivingClient && (
        <ClientArchiveConfirm
          client={archivingClient}
          onClose={() => setArchivingClient(null)}
          onArchived={() => setArchivingClient(null)}
        />
      )}

       {importProgress && <ProgressPanel t={t} progress={importProgress} />}
       {importNotice && (
         <ImportResultPanel t={t} notice={importNotice} onDismiss={() => setImportNotice(null)} />
       )}
     </section>
   );
 }
