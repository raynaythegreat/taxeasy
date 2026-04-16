import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { DraftTransaction, Evidence, OcrFieldConfidence } from "../../lib/ai-api";
import { approveDraft, rejectDraft } from "../../lib/draft-api";
import { useI18n } from "../../lib/i18n";
import { DraftRowEditor } from "./DraftRowEditor";
import { EvidencePreview } from "./EvidencePreview";
import { OcrRawText } from "./OcrRawText";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export function DraftReview({
  evidence,
  drafts,
  clientId,
  accounts,
  confidence,
  ocrThreshold,
}: {
  evidence: Evidence;
  drafts: DraftTransaction[];
  clientId: string;
  accounts: AccountOption[];
  confidence?: OcrFieldConfidence;
  ocrThreshold?: number;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pendingDrafts = useMemo(() => drafts.filter((d) => d.status === "pending"), [drafts]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidateDrafts = () => {
    queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const approveMutation = useMutation({
    mutationFn: (draftId: string) => approveDraft(clientId, draftId),
    onSuccess: invalidateDrafts,
  });

  const rejectMutation = useMutation({
    mutationFn: (draftId: string) => rejectDraft(clientId, draftId),
    onSuccess: invalidateDrafts,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {t("ai.sourceDocument")}
        </h3>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => {
                for (const id of selectedIds) approveMutation.mutate(id);
                setSelectedIds(new Set());
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {t("ai.approveSelected")} ({selectedIds.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              for (const d of pendingDrafts) approveMutation.mutate(d.id);
            }}
            disabled={pendingDrafts.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {t("ai.approveAll")}
          </button>
          <button
            type="button"
            onClick={() => {
              for (const d of pendingDrafts) rejectMutation.mutate(d.id);
            }}
            disabled={pendingDrafts.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t("ai.rejectAll")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">
        <div className="w-full lg:w-1/4 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-neutral-700 overflow-auto">
          <EvidencePreview evidence={evidence} />
        </div>
        <div className="w-full lg:w-1/4 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-neutral-700 overflow-auto">
          <OcrRawText rawText={evidence.ocrRawText} />
        </div>
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-3">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide mb-3">
              {t("ai.draftRows")}
            </h4>
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.id} className="flex items-start gap-2">
                  {draft.status === "pending" && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(draft.id)}
                      onChange={() => toggleSelect(draft.id)}
                      className="mt-1.5 rounded border-gray-300 dark:border-neutral-600"
                    />
                  )}
                  <div className="flex-1">
                    <DraftRowEditor
                      draft={draft}
                      accounts={accounts}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onReject={(id) => rejectMutation.mutate(id)}
                      onUpdate={(_id, _data) => {
                        queryClient.invalidateQueries({ queryKey: ["drafts", clientId] });
                      }}
                      confidence={confidence}
                      ocrThreshold={ocrThreshold}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
