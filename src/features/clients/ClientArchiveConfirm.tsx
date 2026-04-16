import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive } from "lucide-react";
import { useState } from "react";
import { archiveClient } from "../../lib/client-api";
import { useI18n } from "../../lib/i18n";
import type { Client } from "../../lib/tauri";
import { cn } from "../../lib/utils";

interface ClientArchiveConfirmProps {
  client: Client;
  onClose: () => void;
  onArchived: () => void;
}

export function ClientArchiveConfirm({ client, onClose, onArchived }: ClientArchiveConfirmProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => archiveClient(client.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onArchived();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 border border-gray-200">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t("Archive Client")}</h2>
          </div>

          <p className="text-sm text-gray-600">
            {t("Are you sure you want to archive {name}?", { name: client.name })}
          </p>
          <p className="text-xs text-gray-500">
            {t(
              "This client will be hidden from the active client list. Archived clients can be restored later.",
            )}
          </p>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                mutation.isPending
                  ? "bg-amber-400 text-white cursor-wait"
                  : "bg-amber-600 text-white hover:bg-amber-700",
              )}
            >
              <Archive className="w-4 h-4" />
              {mutation.isPending ? t("Archiving…") : t("Archive")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
