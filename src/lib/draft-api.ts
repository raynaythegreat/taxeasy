import { invoke } from "@tauri-apps/api/core";
import type { DraftTransaction } from "./ai-api";

export async function createDraft(
  clientId: string,
  evidenceId: string,
  opts?: {
    date?: string;
    description?: string;
    reference?: string;
    debitAccountId?: string;
    creditAccountId?: string;
    amount?: number;
    notes?: string;
  },
): Promise<DraftTransaction> {
  return invoke<DraftTransaction>("create_draft", {
    clientId,
    evidenceId,
    date: opts?.date ?? null,
    description: opts?.description ?? null,
    reference: opts?.reference ?? null,
    debitAccountId: opts?.debitAccountId ?? null,
    creditAccountId: opts?.creditAccountId ?? null,
    amount: opts?.amount ?? null,
    notes: opts?.notes ?? null,
  });
}

export async function updateDraft(
  clientId: string,
  draftId: string,
  opts?: {
    date?: string;
    description?: string;
    reference?: string;
    debitAccountId?: string;
    creditAccountId?: string;
    amount?: number;
    notes?: string;
  },
): Promise<DraftTransaction> {
  return invoke<DraftTransaction>("update_draft", {
    clientId,
    draftId,
    date: opts?.date ?? null,
    description: opts?.description ?? null,
    reference: opts?.reference ?? null,
    debitAccountId: opts?.debitAccountId ?? null,
    creditAccountId: opts?.creditAccountId ?? null,
    amount: opts?.amount ?? null,
    notes: opts?.notes ?? null,
  });
}

export async function listDrafts(clientId: string, status?: string): Promise<DraftTransaction[]> {
  return invoke<DraftTransaction[]>("list_drafts", { clientId, status: status ?? null });
}

export async function approveDraft(clientId: string, draftId: string): Promise<any> {
  return invoke("approve_draft", { clientId, draftId });
}

export async function rejectDraft(clientId: string, draftId: string): Promise<void> {
  return invoke("reject_draft", { clientId, draftId });
}

export async function bulkApproveDrafts(clientId: string, draftIds: string[]): Promise<any[]> {
  return invoke<any[]>("bulk_approve_drafts", { clientId, draftIds });
}

export async function bulkRejectDrafts(clientId: string, draftIds: string[]): Promise<void> {
  return invoke("bulk_reject_drafts", { clientId, draftIds });
}
