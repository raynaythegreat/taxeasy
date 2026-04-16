import {
  useQuery as useAccountsQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Clock, FileText, MessageSquare, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { DraftTransaction } from "../../lib/ai-api";
import { listEvidence } from "../../lib/ai-api";
import {
  approveDraft,
  bulkApproveDrafts,
  bulkRejectDrafts,
  listDrafts,
  rejectDraft,
} from "../../lib/draft-api";
import { useI18n } from "../../lib/i18n";
import { listAccounts } from "../../lib/tauri";
import { cn, formatDate } from "../../lib/utils";
import { DraftRowEditor } from "./DraftRowEditor";

interface DraftGroup {
  evidenceId: string;
  fileName: string | null;
  sourceType: string;
  extractedAt: string;
  modelUsed: string;
  drafts: DraftTransaction[];
}

function statusBadge(status: string, t: (k: string) => string) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
        styles[status] ?? "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400",
      )}
    >
      {t(`ai.${status}`)}
    </span>
  );
}

export function DraftQueue({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupBySource, setGroupBySource] = useState(true);

  const {
    data: drafts = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["drafts", clientId],
    queryFn: () => listDrafts(clientId),
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ["evidence", clientId],
    queryFn: () => listEvidence(clientId),
  });

  const { data: accounts = [] } = useAccountsQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const evidenceMap = useMemo(() => {
    const map = new Map<string, (typeof evidence)[0]>();
    for (const e of evidence) map.set(e.id, e);
    return map;
  }, [evidence]);

  const groups = useMemo<DraftGroup[]>(() => {
    const map = new Map<string, DraftTransaction[]>();
    for (const d of drafts) {
      const existing = map.get(d.evidenceId) ?? [];
      existing.push(d);
      map.set(d.evidenceId, existing);
    }
    const result: DraftGroup[] = [];
    for (const [evidenceId, groupDrafts] of map) {
      const ev = evidenceMap.get(evidenceId);
      result.push({
        evidenceId,
        fileName: ev?.sourceFileName ?? null,
        sourceType: ev?.sourceType ?? "document",
        extractedAt: ev?.createdAt ?? groupDrafts[0].createdAt,
        modelUsed: ev?.modelUsed ?? "",
        drafts: groupDrafts,
      });
    }
    result.sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
    return result;
  }, [drafts, evidenceMap]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allPending = drafts.filter((d) => d.status === "pending").map((d) => d.id);
    if (selectedIds.size === allPending.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPending));
    }
  };

  const invalidateDrafts = () => {
    queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const approveMutation = useMutation({
    mutationFn: (draftId: string) => approveDraft(clientId, draftId),
    onSuccess: invalidateDrafts,
    onError: (err) => console.error("Approve error:", err),
  });

  const rejectMutation = useMutation({
    mutationFn: (draftId: string) => rejectDraft(clientId, draftId),
    onSuccess: invalidateDrafts,
    onError: (err) => console.error("Reject error:", err),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => bulkApproveDrafts(clientId, ids),
    onSuccess: () => {
      invalidateDrafts();
      setSelectedIds(new Set());
    },
    onError: (err) => console.error("Bulk approve error:", err),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: (ids: string[]) => bulkRejectDrafts(clientId, ids),
    onSuccess: () => {
      invalidateDrafts();
      setSelectedIds(new Set());
    },
  });

  const pendingDrafts = drafts.filter((d) => d.status === "pending");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide">
            {t("ai.draftQueue")}
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-neutral-500">
            {pendingDrafts.length} {t("ai.pending")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={groupBySource}
              onChange={(e) => setGroupBySource(e.target.checked)}
              className="w-3 h-3 rounded border-gray-300 dark:border-neutral-600"
            />
            {t("ai.groupBySource")}
          </label>
          {pendingDrafts.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-2 py-0.5 text-[10px] font-medium border border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-neutral-400 rounded hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                {t("ai.selectAll")}
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => bulkApproveMutation.mutate([...selectedIds])}
                  disabled={bulkApproveMutation.isPending}
                  className="px-2 py-0.5 text-[10px] font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {t("ai.approveSelected")} ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const ids = pendingDrafts.map((d) => d.id);
                  bulkApproveMutation.mutate(ids);
                }}
                disabled={bulkApproveMutation.isPending}
                className="px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {t("ai.approveAll")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const ids = pendingDrafts.map((d) => d.id);
                  bulkRejectMutation.mutate(ids);
                }}
                disabled={bulkRejectMutation.isPending}
                className="px-2 py-0.5 text-[10px] font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {t("ai.rejectAll")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="p-1 rounded text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg aria-hidden="true" className="animate-spin w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24">
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
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 bg-gray-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-gray-400 dark:text-neutral-500" />
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400">{t("ai.noDrafts")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-neutral-800">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.evidenceId);
              const groupPending = group.drafts.filter((d) => d.status === "pending").length;

              return (
                <div key={group.evidenceId}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.evidenceId)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 shrink-0" />
                    )}
                    <div className="shrink-0">
                      {group.sourceType === "chat" ? (
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400 dark:text-neutral-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-neutral-100 truncate">
                        {group.fileName ?? t("ai.chatSource")}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 dark:text-neutral-500">
                          {formatDate(group.extractedAt.split("T")[0])}
                        </span>
                        {group.modelUsed && (
                          <span className="text-[10px] text-gray-400 dark:text-neutral-500">
                            {group.modelUsed}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-neutral-400 shrink-0">
                      {group.drafts.length} {t("ai.draftRows")}
                    </span>
                    {statusBadge(
                      groupPending > 0 ? "pending" : (group.drafts[0]?.status ?? "pending"),
                      t,
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {group.drafts.map((draft) => (
                        <DraftRowEditor
                          key={draft.id}
                          draft={draft}
                          accounts={accounts}
                          onApprove={(id) => approveMutation.mutate(id)}
                          onReject={(id) => rejectMutation.mutate(id)}
                          onUpdate={(_id, _data) => {
                            queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
