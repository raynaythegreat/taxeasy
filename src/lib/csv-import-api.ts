import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface CsvPreview {
  headers: string[];
  rows: string[][];
}

export interface ColumnMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  referenceCol?: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export const previewCsv = (path: string, maxRows: number): Promise<CsvPreview> =>
  invoke("preview_csv", { path, maxRows });

export const importCsv = (
  path: string,
  mapping: ColumnMapping,
  defaultDebitAccount: string,
  defaultCreditAccount: string,
): Promise<ImportResult> =>
  invoke("import_csv", { path, mapping, defaultDebitAccount, defaultCreditAccount });

export const pickCsvFile = (): Promise<string | null> =>
  openDialog({
    multiple: false,
    filters: [{ name: "CSV Files", extensions: ["csv", "txt"] }],
  }) as Promise<string | null>;
