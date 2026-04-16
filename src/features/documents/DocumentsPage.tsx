import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileText,
  FolderOpen,
  Image,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
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
import { getActiveClientId } from "../../lib/tauri";
import { cn } from "../../lib/utils";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "w2", label: "W-2" },
  { value: "1099", label: "1099" },
  { value: "k1", label: "K-1" },
  { value: "receipt", label: "Receipt" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "tax_return", label: "Tax Return" },
  { value: "other", label: "Other" },
] as const;

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image className="w-5 h-5 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
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
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
}

interface DocumentsPageProps {
  compact?: boolean;
}

export function DocumentsPage({ compact = false }: DocumentsPageProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const recentYears = useMemo(
    () => Array.from({ length: 8 }, (_, i) => currentYear - i),
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
    queryKey: ["documents", filterCategory, filterYear],
    queryFn: () => listDocuments(filterCategory ?? undefined, filterYear ?? undefined),
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

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
        await addDocument({
          fileName: name,
          filePath: fp,
          fileSize: 0,
          mimeType: mimeFromName(name),
          category: "general",
          taxYear: filterYear ?? undefined,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      showToast(t("Documents uploaded"), "success");
    } catch (e) {
      showToast(`${t("Upload failed")}: ${e}`, "error");
    } finally {
      setUploading(false);
    }
  }, [filterYear, queryClient, t, showToast]);

  const handleExportClient = useCallback(async () => {
    setExporting(true);
    try {
      const folder = await pickExportFolder();
      if (!folder) return;
      const clientId = await getActiveClientId();
      if (!clientId) {
        showToast(t("No active client"), "error");
        return;
      }
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
  }, [t, showToast]);

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

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

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
                {fileIcon(doc.mimeType)}
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-700">{t("Documents")}</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setFilterYear((y) => (y === null ? currentYear : Math.max(2000, y - 1)))
              }
              disabled={filterYear === null}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setFilterYear(null)}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                  filterYear === null
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                {t("All")}
              </button>
              {recentYears.slice(0, 5).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setFilterYear(y)}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-md transition-colors",
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
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            value={filterCategory ?? ""}
            onChange={(e) => setFilterCategory(e.target.value || null)}
            className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
          >
            <option value="">{t("All Categories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportClient}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {t("Export Client")}
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            {t("Export All")}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? t("Uploading…") : t("Add Documents")}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-200">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search documents…")}
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white w-56"
          />
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {filteredDocs.length} {t("document(s)")}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <svg aria-hidden="true" className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium">{t("No documents yet")}</p>
            <p className="text-gray-400 text-sm mt-1">
              {t("Upload tax documents, receipts, W-2s, and other supporting files.")}
            </p>
            <button
              type="button"
              onClick={handleUpload}
              className="mt-4 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t("Add Documents")}
            </button>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("File")}
                </th>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Category")}
                </th>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Tax Year")}
                </th>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Description")}
                </th>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Date Added")}
                </th>
                <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                  {t("Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      {fileIcon(doc.mimeType)}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate max-w-[200px]">
                          {doc.fileName}
                        </p>
                        <p className="text-xs text-gray-400">{formatFileSize(doc.fileSize)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                        doc.category === "w2" && "bg-blue-50 text-blue-700",
                        doc.category === "1099" && "bg-green-50 text-green-700",
                        doc.category === "k1" && "bg-purple-50 text-purple-700",
                        doc.category === "receipt" && "bg-amber-50 text-amber-700",
                        doc.category === "bank_statement" && "bg-teal-50 text-teal-700",
                        doc.category === "tax_return" && "bg-red-50 text-red-700",
                        doc.category === "general" && "bg-gray-100 text-gray-600",
                        doc.category === "other" && "bg-gray-100 text-gray-600",
                      )}
                    >
                      {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-sm text-gray-700">{doc.taxYear ?? "—"}</td>
                  <td className="px-5 py-2.5 text-sm text-gray-500 max-w-[180px] truncate">
                    {doc.description ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {confirmDelete === doc.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-red-600">{t("Delete?")}</span>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          {t("Yes")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                          {t("No")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(doc.id)}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
