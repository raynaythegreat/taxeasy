import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, CheckCircle, FileText, Loader2, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { ocrDocument } from "../../lib/ai-api";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

interface FileEntry {
  path: string;
  name: string;
  status: "idle" | "uploading" | "processing" | "complete" | "error";
  draftCount: number;
  error: string | null;
}

function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

const ACCEPTED_EXTS = ["pdf", "png", "jpg", "jpeg", "gif", "bmp", "webp"];

export function ImportPanel({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((paths: string[]) => {
    const newFiles: FileEntry[] = paths
      .filter((p) => {
        const ext = fileExt(p.split("/").pop() ?? p.split("\\").pop() ?? p);
        return ACCEPTED_EXTS.includes(ext);
      })
      .map((p) => ({
        path: p,
        name: p.split("/").pop() ?? p.split("\\").pop() ?? p,
        status: "idle" as const,
        draftCount: 0,
        error: null,
      }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const ocrMutation = useMutation({
    mutationFn: async (filePath: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.path === filePath ? { ...f, status: "processing" as const } : f)),
      );
      return ocrDocument(clientId, filePath);
    },
    onSuccess: (result, filePath) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? { ...f, status: "complete" as const, draftCount: result.drafts.length }
            : f,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["evidence", clientId] });
    },
    onError: (err, filePath) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, status: "error" as const, error: String(err) } : f,
        ),
      );
    },
  });

  const processAll = useCallback(() => {
    const idleFiles = files.filter((f) => f.status === "idle" || f.status === "error");
    for (const f of idleFiles) {
      ocrMutation.mutate(f.path);
    }
  }, [files, ocrMutation]);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Documents & Images",
            extensions: ACCEPTED_EXTS,
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      addFiles(paths);
    } catch {}
  }, [addFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const paths: string[] = [];
      if (e.dataTransfer.files) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i] as File & { path?: string };
          if (file.path) paths.push(file.path);
        }
      }
      if (paths.length > 0) addFiles(paths);
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const hasFiles = files.length > 0;
  const pendingCount = files.filter((f) => f.status === "idle" || f.status === "error").length;

  return (
    <div className="flex flex-col h-full p-5">
      {!hasFiles ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer",
            isDragOver
              ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/50 hover:border-gray-400 dark:hover:border-neutral-500",
          )}
          onClick={handleBrowse}
        >
          <Upload className="w-10 h-10 text-gray-400 dark:text-neutral-500 mb-3" />
          <p className="text-sm font-medium text-gray-600 dark:text-neutral-300">
            {t("ai.dropFiles")}
          </p>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">
            {t("ai.fileSupported")}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleBrowse();
            }}
            className="mt-4 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t("ai.browseFiles")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-300">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </h2>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={processAll}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  {t("ai.processing")}
                </button>
              )}
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 rounded hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
              >
                {t("ai.browseFiles")}
              </button>
            </div>
          </div>
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              <FileText className="w-5 h-5 text-gray-400 dark:text-neutral-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-neutral-100 truncate">{f.name}</p>
                {f.status === "complete" && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {t("ai.draftsExtracted", { count: String(f.draftCount) })}
                  </p>
                )}
                {f.status === "error" && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{f.error}</p>
                )}
              </div>
              <div className="shrink-0">
                {f.status === "idle" && (
                  <span className="text-xs text-gray-400 dark:text-neutral-500">—</span>
                )}
                {f.status === "uploading" && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                {f.status === "processing" && (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {t("ai.processing")}
                    </span>
                  </div>
                )}
                {f.status === "complete" && <CheckCircle className="w-4 h-4 text-green-500" />}
                {f.status === "error" && (
                  <button
                    type="button"
                    onClick={() => ocrMutation.mutate(f.path)}
                    className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {t("ai.retry")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
