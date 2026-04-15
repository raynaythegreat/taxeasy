import { invoke } from "@tauri-apps/api/core";

export interface Evidence {
  id: string;
  clientId: string;
  sourceType: string;
  sourceFileName: string | null;
  sourceFileHash: string | null;
  sourceFilePath: string | null;
  ocrRawText: string | null;
  extractedFields: string | null;
  modelUsed: string;
  confidenceScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftTransaction {
  id: string;
  clientId: string;
  evidenceId: string;
  date: string | null;
  description: string | null;
  reference: string | null;
  debitAccountId: string | null;
  creditAccountId: string | null;
  amount: number | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  clientId: string;
  role: string;
  content: string;
  evidenceId: string | null;
  createdAt: string;
}

export interface ChatResponse {
  message: ChatMessage;
  drafts: DraftTransaction[];
}

export interface OcrResult {
  evidence: Evidence;
  drafts: DraftTransaction[];
}

export async function sendChatMessage(clientId: string, message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>("send_chat_message", { clientId, message });
}

export async function getChatHistory(clientId: string): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>("get_chat_history", { clientId });
}

export async function clearChatHistory(clientId: string): Promise<void> {
  return invoke("clear_chat_history", { clientId });
}

export async function ocrDocument(clientId: string, filePath: string): Promise<OcrResult> {
  return invoke<OcrResult>("ocr_document", { clientId, filePath });
}

export async function ocrBulk(clientId: string, filePaths: string[]): Promise<OcrResult[]> {
  return invoke<OcrResult[]>("ocr_bulk", { clientId, filePaths });
}

export async function storeEvidence(
  clientId: string,
  sourceType: string,
  opts?: {
    fileName?: string;
    fileData?: number[];
    ocrText?: string;
    extractedFields?: string;
    modelUsed?: string;
    confidence?: number;
  }
): Promise<Evidence> {
  return invoke<Evidence>("store_evidence", {
    clientId,
    sourceType,
    fileName: opts?.fileName ?? null,
    fileData: opts?.fileData ?? null,
    ocrText: opts?.ocrText ?? null,
    extractedFields: opts?.extractedFields ?? null,
    modelUsed: opts?.modelUsed ?? null,
    confidence: opts?.confidence ?? null,
  });
}

export async function listEvidence(clientId: string): Promise<Evidence[]> {
  return invoke<Evidence[]>("list_evidence", { clientId });
}

export async function getEvidence(clientId: string, evidenceId: string): Promise<Evidence> {
  return invoke<Evidence>("get_evidence", { clientId, evidenceId });
}

export async function deleteEvidence(clientId: string, evidenceId: string): Promise<void> {
  return invoke("delete_evidence", { clientId, evidenceId });
}
