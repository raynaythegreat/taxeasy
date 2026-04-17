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

          {/* Add all other fields from ClientEditModal, adapted for BusinessProfile */}

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
