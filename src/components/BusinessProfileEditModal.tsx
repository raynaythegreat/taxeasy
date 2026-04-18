import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import {
  saveBusinessProfile,
  type BusinessProfile,
  type SaveBusinessProfilePayload,
} from "../lib/business-profile-api";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import type { EntityType } from "../lib/tauri";

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "sole_prop", label: "Sole Proprietor" },
  { value: "smllc", label: "SMLLC" },
  { value: "scorp", label: "S-Corp" },
  { value: "ccorp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
];

interface BusinessProfileEditModalProps {
  profile: BusinessProfile;
  onClose: () => void;
  onSaved: () => void;
}

export function BusinessProfileEditModal({
  profile,
  onClose,
  onSaved,
}: BusinessProfileEditModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<SaveBusinessProfilePayload>({
    name: profile.name,
    entity_type: profile.entity_type,
    ein: profile.ein,
    contact_name: profile.contact_name,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    address_line1: profile.address_line1,
    address_line2: profile.address_line2,
    city: profile.city,
    state: profile.state,
    postal_code: profile.postal_code,
    country: profile.country,
    tax_preparer_notes: profile.tax_preparer_notes,
    filing_notes: profile.filing_notes,
    fiscal_year_start_month: profile.fiscal_year_start_month,
    accounting_method: profile.accounting_method,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: SaveBusinessProfilePayload) => saveBusinessProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business_profile"] });
      onSaved();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  function updateField<K extends keyof SaveBusinessProfilePayload>(
    key: K,
    value: SaveBusinessProfilePayload[K],
  ) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formState.name?.trim()) {
      setError(t("Business name is required."));
      return;
    }
    setError(null);
    mutation.mutate(formState);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t("Edit Business Profile")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Business Name")} <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-name"
              type="text"
              value={formState.name ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("name", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-entity" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Entity Type")}
            </label>
            <select
              id="edit-entity"
              value={formState.entity_type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                updateField("entity_type", e.target.value as EntityType)
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-ein" className="block text-sm font-medium text-gray-700 mb-1">
                {t("EIN")}
              </label>
              <input
                id="edit-ein"
                type="text"
                value={formState.ein ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("ein", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-contact" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Contact Name")}
              </label>
              <input
                id="edit-contact"
                type="text"
                value={formState.contact_name ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("contact_name", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Email")}
              </label>
              <input
                id="edit-email"
                type="email"
                value={formState.email ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("email", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-phone" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Phone")}
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={formState.phone ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("phone", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-website" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Website")}
            </label>
            <input
              id="edit-website"
              type="url"
              value={formState.website ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("website", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-address1" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Address Line 1")}
            </label>
            <input
              id="edit-address1"
              type="text"
              value={formState.address_line1 ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("address_line1", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-address2" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Address Line 2")}
            </label>
            <input
              id="edit-address2"
              type="text"
              value={formState.address_line2 ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("address_line2", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-city" className="block text-sm font-medium text-gray-700 mb-1">
                {t("City")}
              </label>
              <input
                id="edit-city"
                type="text"
                value={formState.city ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("city", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-state" className="block text-sm font-medium text-gray-700 mb-1">
                {t("State")}
              </label>
              <input
                id="edit-state"
                type="text"
                value={formState.state ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("state", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-postal" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Postal Code")}
              </label>
              <input
                id="edit-postal"
                type="text"
                value={formState.postal_code ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("postal_code", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-country" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Country")}
            </label>
            <input
              id="edit-country"
              type="text"
              value={formState.country ?? ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("country", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-fy" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Fiscal Year Start")}
              </label>
              <select
                id="edit-fy"
                value={formState.fiscal_year_start_month ?? 1}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateField("fiscal_year_start_month", parseInt(e.target.value, 10))
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {t("Month")} {month}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-accounting" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Accounting Method")}
              </label>
              <select
                id="edit-accounting"
                value={formState.accounting_method ?? "cash"}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateField("accounting_method", e.target.value)
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              >
                <option value="cash">{t("Cash")}</option>
                <option value="accrual">{t("Accrual")}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="edit-tax-notes" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Tax Preparer Notes")}
            </label>
            <textarea
              id="edit-tax-notes"
              value={formState.tax_preparer_notes ?? ""}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateField("tax_preparer_notes", e.target.value)
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-filing-notes" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Filing Notes")}
            </label>
            <textarea
              id="edit-filing-notes"
              value={formState.filing_notes ?? ""}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateField("filing_notes", e.target.value)
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              disabled={mutation.isPending}
            />
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                mutation.isPending
                  ? "bg-blue-400 text-white cursor-wait"
                  : "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              {mutation.isPending ? t("Saving…") : t("Save Changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
