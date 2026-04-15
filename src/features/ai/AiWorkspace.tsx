import { useState } from "react";
import { MessageSquare, Upload, ListChecks, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { ChatPanel } from "./ChatPanel";
import { ImportPanel } from "./ImportPanel";
import { DraftQueue } from "./DraftQueue";

type AiTab = "chat" | "import";

export function AiWorkspace({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AiTab>("chat");
  const [showDraftQueue, setShowDraftQueue] = useState(true);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {t("ai.workspaceTitle")}
          </h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
            <Cpu className="w-3 h-3" />
            {t("ai.localBadge")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-0.5">
            <button
              type="button"
              aria-label={t("ai.chatTab")}
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "chat"
                  ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 shadow-sm"
                  : "text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-300"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t("ai.chatTab")}
            </button>
            <button
              type="button"
              aria-label={t("ai.importTab")}
              onClick={() => setActiveTab("import")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "import"
                  ? "bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 shadow-sm"
                  : "text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-300"
              )}
            >
              <Upload className="w-3.5 h-3.5" />
              {t("ai.importTab")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowDraftQueue((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
              showDraftQueue
                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
            )}
          >
            <ListChecks className="w-3.5 h-3.5" />
            {t("ai.draftQueue")}
            {showDraftQueue ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "chat" ? (
          <ChatPanel clientId={clientId} />
        ) : (
          <ImportPanel clientId={clientId} />
        )}
      </div>

      {showDraftQueue && (
        <div className="shrink-0 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 max-h-[40%] overflow-auto">
          <DraftQueue clientId={clientId} />
        </div>
      )}
    </div>
  );
}
