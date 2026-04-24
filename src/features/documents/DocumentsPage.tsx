import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileText,
  FolderSearch,
  Image,
  Search,
  Trash2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { useCallback, useMemo, useState } from "react";
import {
  addDocument,
  deleteDocument,
  exportAllClientsDocuments,
  exportClientDocuments,
  formatFileSize,
  listDocuments,
  pickDocumentFile,
  pickExportFolder,
} from "../../lib/documents-api";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "w2", label: "W-2" },
  { value: "1099", label: "1099" },
  { value: "k1", label: "K-1" },
  { value: "receipt", label: "Receipt" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "organizer", label: "Organizer" },
  { value: "tax_return", label: "Tax Return" },
  { value: "other", label: "Other" },
] as const;

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  w2: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "1099": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  k1: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  receipt: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  bank_statement: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  organizer: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  tax_return: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  general: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  other: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

function getFileIcon(mimeType: string, fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isSpreadsheet = ["xlsx", "xls", "csv"].includes(ext);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (isImage) return <Image className="w-4 h-4 text-sky-500" />;
  if (isPdf) return <FileText className="w-4 h-4 text-rose-500" />;
  if (isSpreadsheet) return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    csv: "text/csv",
    txt: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-offidedocument.wordprocessingml.document",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

interface DocumentsPageProps {
  clientId: string;
  compact?: boolean;
}

export function DocumentsPage({ clientId, compact = false }: DocumentsPageProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", clientId, filterCategory, filterYear],
    queryFn: () => listDocuments(clientId, filterCategory ?? undefined, filterYear ?? undefined),
  });

  const filteredDocs = useMemo(() => {
    if (!searchQuery) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.fileName.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [documents, searchQuery]);

  const stats = useMemo(() => {
    const byCategory = documents.reduce<Record<string, number>>((acc, doc) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {});
    const totalSize = documents.reduce((sum, doc) => sum + doc.fileSize, 0);
    return { byCategory, totalSize, count: documents.length };
  }, [documents]);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id, clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", clientId] });
      setConfirmDelete(null);
    },
  });

  const handleUpload = useCallback(async () => {
    setUploading(true);
    try {
      const files = await pickDocumentFile();
      if (!files) return;
      const fileArr = Array.isArray(files) ? files : [files];
      for (const fp of fileArr) {
        const name = fp.split("/").pop() ?? fp.split("\\").pop() ?? fp;
        await addDocument(
          {
            fileName: name,
            filePath: fp,
            fileSize: 0,
            mimeType: mimeFromName(name),
            category: "general",
            taxYear: filterYear ?? undefined,
          },
          clientId,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["documents", clientId] });
      showToast(t("Documents uploaded"), "success");
    } catch (e) {
      showToast(`${t("Upload failed")}: ${e}`, "error");
    } finally {
      setUploading(false);
    }
  }, [clientId, filterYear, queryClient, t, showToast]);

  const handleExportClient = useCallback(async () => {
    setExporting(true);
    try {
      const folder = await pickExportFolder();
      if (!folder) return;
      const result = await exportClientDocuments(clientId, folder);
      showToast(
        t("Exported {count} documents to {folder}", {
          count: String(result.documentCount),
          folder: result.folder,
        }),
        "success",
      );
    } catch (e) {
      showToast(`${t("Export failed")}: ${e}`, "error");
    } finally {
      setExporting(false);
    }
  }, [clientId, t, showToast]);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const folder = await pickExportFolder();
      if (!folder) return;
      const result = await exportAllClientsDocuments(folder);
      showToast(
        t("Exported {count} documents for {clients} clients", {
          count: String(result.documentCount),
          clients: String(result.clientCount),
        }),
        "success",
      );
    } catch (e) {
      showToast(`${t("Export failed")}: ${e}`, "error");
    } finally {
      setExporting(false);
    }
  }, [t, showToast]);

  if (compact) {
    return (
      <div className="p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{t("Documents")}</h3>
          <span className="text-xs text-gray-500">
            {documents.length} {t("files")}
          </span>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">{t("No documents")}</p>
        ) : (
          <div className="space-y-1">
            {documents.slice(0, 5).map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 py-1">
                {getFileIcon(doc.mimeType, doc.fileName)}
                <span className="text-sm text-gray-700 truncate flex-1">{doc.fileName}</span>
                <span className="text-xs text-gray-400">{doc.category}</span>
              </div>
            ))}
            {documents.length > 5 && (
              <p className="text-xs text-gray-400 pt-1">+{documents.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-5 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{t("Documents")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.count > 0
                ? t("{count} files · {size}", {
                    count: String(stats.count),
                    size: formatFileSize(stats.totalSize),
                  })
                : t("Upload tax documents, receipts, and supporting files")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportClient}
              disabled={exporting || stats.count === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Download className="w-4 h-4" />
              {t("Export")}
            </button>
            <button
              type="button"
              onClick={handleExportAll}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Archive className="w-4 h-4" />
              {t("Export All")}
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Upload className="w-4 h-4" />
              {uploading ? t("Uploading…") : t("Add Documents")}
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3">
          {/* Year filter */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setFilterYear((y) => (y === null ? currentYear : Math.max(2000, y - 1)))
              }
              disabled={filterYear === null}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setFilterYear(null)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                  filterYear === null
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {t("All")}
              </button>
              {recentYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setFilterYear(y)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    filterYear === y
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setFilterYear((y) => (y === null ? currentYear : Math.min(currentYear, y + 1)))
              }
              disabled={filterYear === null || filterYear >= currentYear}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Category filter */}
          <select
            value={filterCategory ?? ""}
            onChange={(e) => setFilterCategory(e.target.value || null)}
            className="h-8 pl-2 pr-8 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          >
            <option value="">{t("All Categories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search documents…")}
              className="h-8 pl-9 pr-3 text-sm border border-gray-300 rounded-lg bg-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="px-6 py-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded bg-gray-200 w-48" />
                  <div className="h-3 rounded bg-gray-100 w-24" />
                </div>
                <div className="h-5 rounded-full bg-gray-200 w-16" />
                <div className="h-4 rounded bg-gray-100 w-20" />
                <div className="h-4 rounded bg-gray-100 w-24" />
              </div>
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[320px]">
            <EmptyState
              icon={<FolderSearch className="w-8 h-8" />}
              title={t("No documents yet")}
              description={t("Upload tax documents, receipts, W-2s, and other supporting files.")}
              action={{ label: t("Add Documents"), onClick: handleUpload }}
            />
          </div>
        ) : (
          <div className="px-6 py-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("File")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("Category")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("Tax Year")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("Description")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("Size")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("Date Added")}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                      {t("Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDocs.map((doc) => {
                    const catColor = CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.general;
                    return (
                      <tr
                        key={doc.id}
                        className="group hover:bg-gray-50/80 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 shrink-0">
                              {getFileIcon(doc.mimeType, doc.fileName)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                                {doc.fileName}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {doc.mimeType.split("/")[1]?.toUpperCase()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                              catColor.bg,
                              catColor.text,
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full", catColor.dot)} />
                            {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 font-mono">
                            {doc.taxYear ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500 max-w-[160px] truncate block">
                            {doc.description ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500 tabular-nums">
                            {formatFileSize(doc.fileSize)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {new Date(doc.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {confirmDelete === doc.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-xs text-gray-500">{t("Delete?")}</span>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate(doc.id)}
                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                              >
                                {t("Yes")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                {t("No")}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(doc.id)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer summary */}
            {filteredDocs.length !== documents.length && (
              <div className="mt-3 text-center">
                <span className="text-xs text-gray-500">
                  {t("Showing {count} of {total} documents", {
                    count: String(filteredDocs.length),
                    total: String(documents.length),
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
