import { Check, X } from "lucide-react";
import { cn, formatCurrency, formatDate } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface TransactionCardProps {
  draft: {
    id: string;
    date: string | null;
    description: string | null;
    amount: number | null;
    debitAccountId: string | null;
    creditAccountId: string | null;
    status: string;
  };
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  accounts?: Array<{ id: string; code: string; name: string }>;
}

function resolveAccount(
  accountId: string | null,
  accounts?: Array<{ id: string; code: string; name: string }>,
): string {
  if (!accountId) return "—";
  if (!accounts?.length) return accountId;
  const found = accounts.find((a) => a.id === accountId);
  return found ? `${found.name} (${found.code})` : accountId;
}

export function TransactionCard({ draft, onApprove, onReject, accounts }: TransactionCardProps) {
  const { t } = useI18n();
  const isPending = draft.status === "pending";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden animate-in fade-in duration-200">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
          {t("ai.chatSource")}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            draft.status === "approved"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : draft.status === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
          )}
        >
          {t(`ai.${draft.status}`)}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        <p className="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">
          {draft.description ?? "Untitled transaction"}
        </p>

        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-neutral-400">
          {draft.date && <span>{formatDate(draft.date)}</span>}
          {draft.amount != null && (
            <span className="font-medium text-gray-900 dark:text-neutral-100">
              {formatCurrency(draft.amount / 100)}
            </span>
          )}
        </div>

        <div className="space-y-0.5 text-xs text-gray-500 dark:text-neutral-400">
          <div className="flex gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-neutral-500 w-10 shrink-0">
              Dr
            </span>
            <span className="truncate">{resolveAccount(draft.debitAccountId, accounts)}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-neutral-500 w-10 shrink-0">
              Cr
            </span>
            <span className="truncate">{resolveAccount(draft.creditAccountId, accounts)}</span>
          </div>
        </div>
      </div>

      {isPending && (onApprove || onReject) && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-neutral-800 flex items-center gap-2">
          {onApprove && (
            <button
              type="button"
              onClick={() => onApprove(draft.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Check className="w-3 h-3" />
              {t("ai.approve")}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={() => onReject(draft.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-3 h-3" />
              {t("ai.reject")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
