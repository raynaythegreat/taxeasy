import { FileDown, HardDriveDownload, HardDriveUpload } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { SaveSettingsPayload } from "../../../lib/settings-api";
import { BackupRestoreCard } from "../BackupRestoreCard";

interface DataManagementTabProps {
  exportPath: string;
  backupLoading: boolean;
  restoreLoading: boolean;
  saving: boolean;
  onBackup: () => void;
  onRestoreRequest: () => void;
  onSave: (partial: SaveSettingsPayload) => void;
}

export function DataManagementTab({
  exportPath,
  backupLoading,
  restoreLoading,
  saving,
  onBackup,
  onRestoreRequest,
  onSave,
}: DataManagementTabProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <BackupRestoreCard
        title={t("Backup Client Data")}
        description={t(
          "Create a complete backup of all client data, transactions, and settings. The backup will be saved as a file you choose.",
        )}
        buttonText={t("Backup Client Data")}
        buttonIcon={HardDriveUpload}
        onAction={onBackup}
        loading={backupLoading}
        variant="primary"
      />

      <BackupRestoreCard
        title={t("Restore from Backup")}
        description={t(
          "Restore all data from a previously created backup file. This will replace all current data.",
        )}
        buttonText={t("Restore from Backup")}
        buttonIcon={HardDriveDownload}
        onAction={onRestoreRequest}
        loading={restoreLoading}
        variant="danger"
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">{t("Export All Transactions")}</h4>
        <p className="text-sm text-gray-500">
          {t("Download all transactions across all clients as a CSV file.")}
        </p>
        <button
          type="button"
          onClick={() => onSave({ default_export_path: exportPath })}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FileDown className="w-4 h-4" />
          {t("Export All Transactions (CSV)")}
        </button>
      </div>
    </div>
  );
}
