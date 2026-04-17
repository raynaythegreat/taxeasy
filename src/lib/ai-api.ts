import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system";
  content: string;
  evidenceId: string | null;
  createdAt: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: "pending" | "running" | "completed" | "error";
  parentMessageId?: string;
  metadata?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  drafts: DraftTransaction[];
}

export interface OcrFieldConfidence {
  vendor: number;
  date: number;
  total: number;
  /** Minimum across all fields — used by the UI to gate auto-post. */
  overall: number;
}

export interface OcrResult {
  evidence: Evidence;
  drafts: DraftTransaction[];
  confidence: OcrFieldConfidence;
}

export async function sendChatMessage(clientId: string, message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>("send_chat_message", { clientId, message });
}

export async function sendChatMessageStream(clientId: string, message: string): Promise<string> {
  return invoke<string>("send_chat_message_stream", { clientId, message });
}

export async function checkAiHealth(): Promise<boolean> {
  return invoke<boolean>("ollama_health");
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
  },
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

export type StreamEventType =
  | "start"
  | "delta"
  | "tool_call"
  | "tool_progress"
  | "tool_result"
  | "end"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  conversationId: string;
  messageId?: string;
  delta?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolStatus?: "pending" | "running" | "completed" | "error";
  progress?: string;
  error?: string;
}

export function listenChatStream(onEvent: (event: StreamEvent) => void): Promise<UnlistenFn> {
  return listen<StreamEvent>("chat-stream", (event) => {
    onEvent(event.payload);
  });
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  status: "pending" | "running" | "completed" | "error";
}

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/import", label: "Import", description: "Import a document or file", icon: "Upload" },
  {
    command: "/query",
    label: "Query",
    description: "Query the ledger or accounts",
    icon: "Search",
  },
  {
    command: "/report",
    label: "Report",
    description: "Generate a financial report",
    icon: "FileText",
  },
  {
    command: "/categorize",
    label: "Categorize",
    description: "Categorize a transaction",
    icon: "Tag",
  },
  { command: "/help", label: "Help", description: "Show available commands", icon: "HelpCircle" },
];
