import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface TaxDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  fileHash?: string | null;
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

export async function listDocuments(
  clientId: string,
  category?: string,
  taxYear?: number,
): Promise<TaxDocument[]> {
  return invoke<TaxDocument[]>("list_documents", {
    clientId,
    category: category ?? null,
    taxYear: taxYear ?? null,
  });
}

export interface AddDocumentPayload {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  fileHash?: string;
  category?: string;
  taxYear?: number;
  description?: string;
}

export async function addDocument(
  payload: AddDocumentPayload,
  clientId: string,
): Promise<TaxDocument> {
  return invoke<TaxDocument>("add_document", { payload, clientId });
}

export async function deleteDocument(id: string, clientId: string): Promise<void> {
  return invoke("delete_document", { id, clientId });
}

export async function updateDocument(
  params: {
    id: string;
    category?: string;
    taxYear?: number;
    description?: string;
  },
  clientId: string,
): Promise<void> {
  return invoke("update_document", { ...params, clientId });
}

export async function exportClientDocuments(
  clientId: string,
  outputFolder: string,
): Promise<ExportResult> {
  return invoke<ExportResult>("export_client_documents", { clientId, outputFolder });
}

export async function exportAllClientsDocuments(outputFolder: string): Promise<ExportResult> {
  return invoke<ExportResult>("export_all_clients_documents", { outputFolder });
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
