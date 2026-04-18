import { invoke } from "./tauri";

export interface Vendor {
  id: string;
  client_id: string;
  name: string;
  ein?: string;
  ssn_encrypted?: Uint8Array;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  total_payments_cents: number;
  is_1099_required: boolean;
  created_at: string;
}

export interface ContractorPayment {
  id: string;
  vendor_id: string;
  transaction_id: string;
  amount_cents: number;
  payment_date: string;
  created_at: string;
}

export interface Generated1099Nec {
  id: string;
  vendor_id: string;
  tax_year: number;
  box1_nonemployee_compensation: number;
  box2_cash_received: number;
  box4_federal_tax_withheld: number;
  box5_state_tax_withheld: number;
  box6_state_number?: string;
  generated_at: string;
  pdf_path?: string;
}

export interface CreateVendorPayload {
  name: string;
  ein?: string;
  ssn_encrypted?: Uint8Array;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  [key: string]: string | Uint8Array | undefined;
}

export interface UpdateVendorPayload {
  vendor_id: string;
  name?: string;
  ein?: string;
  ssn_encrypted?: Uint8Array;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  [key: string]: string | Uint8Array | undefined;
}

export interface RecordPaymentPayload {
  vendor_id: string;
  transaction_id: string;
  amount_cents: number;
  payment_date: string;
  [key: string]: string | number;
}

export async function listVendors(): Promise<Vendor[]> {
  return invoke("list_vendors");
}

export async function createVendor(payload: CreateVendorPayload): Promise<Vendor> {
  return invoke("create_vendor", payload);
}

export async function updateVendor(payload: UpdateVendorPayload): Promise<Vendor> {
  return invoke("update_vendor", payload);
}

export async function deleteVendor(vendorId: string): Promise<void> {
  return invoke("delete_vendor", { vendorId });
}

export async function recordContractorPayment(
  payload: RecordPaymentPayload,
): Promise<ContractorPayment> {
  return invoke("record_contractor_payment", payload);
}

export async function listContractorPayments(
  vendorId: string,
  year: number,
): Promise<ContractorPayment[]> {
  return invoke("list_contractor_payments", { vendorId, year });
}

export async function generate1099Nec(
  vendorId: string,
  taxYear: number,
): Promise<Generated1099Nec> {
  return invoke("generate_1099_nec", { vendorId, taxYear });
}

export async function listGenerated1099Nec(year: number): Promise<Generated1099Nec[]> {
  return invoke("list_generated_1099_nec", { year });
}
