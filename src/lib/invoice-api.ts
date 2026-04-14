import { invoke } from "@tauri-apps/api/core";

export type InvoiceType = "invoice" | "receipt" | "estimate";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  client_name: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  transaction_id: string | null;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export interface InvoiceDetail extends Invoice {
  client_email: string | null;
  client_address: string | null;
  notes: string | null;
  tax_rate: number;
  lines: InvoiceLine[];
}

export interface CreateInvoiceLinePayload {
  description: string;
  quantity?: number;
  unit_price_cents?: number;
}

export interface CreateInvoicePayload {
  invoice_number: string;
  invoice_type: InvoiceType;
  issue_date: string;
  due_date?: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  notes?: string;
  tax_rate?: number;
  lines: CreateInvoiceLinePayload[];
}

export interface UpdateInvoicePayload {
  invoice_number?: string;
  issue_date?: string;
  due_date?: string | null;
  client_name?: string;
  client_email?: string | null;
  client_address?: string | null;
  notes?: string | null;
  tax_rate?: number;
  lines?: CreateInvoiceLinePayload[];
}

export async function listInvoices(params?: {
  invoiceType?: string;
  status?: string;
}): Promise<Invoice[]> {
  return invoke("list_invoices", {
    invoiceType: params?.invoiceType ?? null,
    status: params?.status ?? null,
  });
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  return invoke("get_invoice", { id });
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<InvoiceDetail> {
  return invoke("create_invoice", { payload });
}

export async function updateInvoice(id: string, payload: UpdateInvoicePayload): Promise<InvoiceDetail> {
  return invoke("update_invoice", { id, payload });
}

export async function deleteInvoice(id: string): Promise<void> {
  return invoke("delete_invoice", { id });
}

export async function updateInvoiceStatus(id: string, status: string): Promise<void> {
  return invoke("update_invoice_status", { id, status });
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
