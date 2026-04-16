import { FileText, Image, MessageSquare } from "lucide-react";
import type { Evidence } from "../../lib/ai-api";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

function confidenceColor(score: number | null): string {
  if (score === null) return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400";
  if (score > 0.8) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (score >= 0.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function confidenceLabel(score: number | null): string {
  if (score === null) return "—";
  if (score > 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

export function EvidencePreview({ evidence }: { evidence: Evidence }) {
  const { t } = useI18n();
  const isImage =
    evidence.sourceFilePath && /\.(png|jpe?g|gif|bmp|webp)$/i.test(evidence.sourceFilePath);
  const isPdf = evidence.sourceFilePath && /\.pdf$/i.test(evidence.sourceFilePath);
  const isChat = evidence.sourceType === "chat";

  return (
    <div className="p-4">
      <h4 className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide mb-3">
        {t("ai.sourceDocument")}
      </h4>
      <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 overflow-hidden mb-4">
        <div className="flex items-center justify-center h-40">
          {isChat ? (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-neutral-500">
              <MessageSquare className="w-8 h-8" />
              <span className="text-xs">{t("ai.chatSource")}</span>
            </div>
          ) : isPdf ? (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-neutral-500">
              <FileText className="w-8 h-8" />
              <span className="text-xs">PDF</span>
            </div>
          ) : isImage && evidence.sourceFilePath ? (
            <img
              src={evidence.sourceFilePath}
              alt={evidence.sourceFileName ?? "Document"}
              className="max-h-40 object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-neutral-500">
              <Image className="w-8 h-8" />
              <span className="text-xs">{t("ai.documentSource")}</span>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-neutral-400">{t("File")}</span>
          <span className="text-gray-900 dark:text-neutral-200 truncate max-w-[180px]">
            {evidence.sourceFileName ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-neutral-400">{t("ai.extractedOn")}</span>
          <span className="text-gray-900 dark:text-neutral-200">
            {new Date(evidence.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-neutral-400">{t("ai.modelUsed")}</span>
          <span className="text-gray-900 dark:text-neutral-200">{evidence.modelUsed || "—"}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-neutral-400">{t("ai.confidence")}</span>
          <span
            className={cn(
              "inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium",
              confidenceColor(evidence.confidenceScore),
            )}
          >
            {confidenceLabel(evidence.confidenceScore)}
            {evidence.confidenceScore !== null && ` ${Math.round(evidence.confidenceScore * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
