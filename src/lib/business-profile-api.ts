import { invoke } from "@tauri-apps/api/core";

// Business Profile
export interface BusinessProfile {
  id: string;
  name: string;
  entity_type: string;
  ein?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  fiscal_year_start_month: number;
  accounting_method: string;
  profile_image_path?: string;
  tax_preparer_notes?: string;
  filing_notes?: string;
}

export interface SaveBusinessProfilePayload {
  name?: string;
  entity_type?: string;
  ein?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  fiscal_year_start_month?: number;
  accounting_method?: string;
  profile_image_path?: string;
  tax_preparer_notes?: string;
  filing_notes?: string;
}

export const getBusinessProfile = (): Promise<BusinessProfile> =>
  invoke("get_business_profile");

export const saveBusinessProfile = (payload: SaveBusinessProfilePayload): Promise<void> =>
  invoke("save_business_profile", { payload });