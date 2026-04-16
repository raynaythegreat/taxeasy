import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface TaxDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category: string;
  taxYear: number | null;
  description: string | null;
  createdAt: string;
}

export interface ExportResult {
  folder: string;
  clientCount: number;
  documentCount: number;
}

export async function listDocuments(category?: string, taxYear?: number): Promise<TaxDocument[]> {
  return invoke<TaxDocument[]>("listDocuments", {
    category: category ?? null,
    taxYear: taxYear ?? null,
  });
}

export interface AddDocumentPayload {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category?: string;
  taxYear?: number;
  description?: string;
}

export async function addDocument(payload: AddDocumentPayload): Promise<TaxDocument> {
  return invoke<TaxDocument>("addDocument", { payload });
}

export async function deleteDocument(id: string): Promise<void> {
  return invoke("deleteDocument", { id });
}

export async function updateDocument(params: {
  id: string;
  category?: string;
  taxYear?: number;
  description?: string;
}): Promise<void> {
  return invoke("updateDocument", params);
}

export async function exportClientDocuments(
  clientId: string,
  outputFolder: string,
): Promise<ExportResult> {
  return invoke<ExportResult>("exportClientDocuments", { clientId, outputFolder });
}

export async function exportAllClientsDocuments(outputFolder: string): Promise<ExportResult> {
  return invoke<ExportResult>("exportAllClientsDocuments", { outputFolder });
}

export async function pickDocumentFile(): Promise<string | null> {
  return open({
    multiple: true,
    filters: [
      {
        name: "Documents",
        extensions: [
          "pdf",
          "jpg",
          "jpeg",
          "png",
          "webp",
          "heic",
          "heif",
          "tiff",
          "tif",
          "bmp",
          "gif",
          "csv",
          "txt",
          "xlsx",
          "xls",
          "doc",
          "docx",
          "zip",
        ],
      },
    ],
  }) as Promise<string | null>;
}

export async function pickExportFolder(): Promise<string | null> {
  return open({ directory: true }) as Promise<string | null>;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
