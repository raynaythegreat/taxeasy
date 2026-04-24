import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { FolderOpen, FolderSearch, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { updateClient } from "../../lib/client-api";
import { useI18n } from "../../lib/i18n";
import {
  type AccountingMethod,
  type Client,
  type EntityType,
  pickClientFolder,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "sole_prop", label: "Sole Proprietor" },
  { value: "smllc", label: "SMLLC" },
  { value: "scorp", label: "S-Corp" },
  { value: "ccorp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
  { value: "i1040", label: "1040 Individual" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface ClientEditModalProps {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export function ClientEditModal({ client, onClose, onSaved }: ClientEditModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(client.name);
  const [entityType, setEntityType] = useState<EntityType>(client.entity_type);
  const [ein, setEin] = useState(client.ein ?? "");
  const [sourceFolderPath, setSourceFolderPath] = useState(client.source_folder_path ?? "");
  const [contactName, setContactName] = useState(client.contact_name ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [website, setWebsite] = useState(client.website ?? "");
  const [addressLine1, setAddressLine1] = useState(client.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(client.address_line2 ?? "");
  const [city, setCity] = useState(client.city ?? "");
  const [stateName, setStateName] = useState(client.state ?? "");
  const [postalCode, setPostalCode] = useState(client.postal_code ?? "");
  const [country, setCountry] = useState(client.country ?? "");
  const [taxPreparerNotes, setTaxPreparerNotes] = useState(client.tax_preparer_notes ?? "");
  const [filingNotes, setFilingNotes] = useState(client.filing_notes ?? "");
  const [fiscalMonth, setFiscalMonth] = useState(client.fiscal_year_start_month);
  const [method, setMethod] = useState<AccountingMethod>(client.accounting_method);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateClient(client.id, {
        name: name.trim(),
        entity_type: entityType,
        ein: ein.trim() || undefined,
        source_folder_path: sourceFolderPath.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        tax_preparer_notes: taxPreparerNotes.trim() || undefined,
        filing_notes: filingNotes.trim() || undefined,
        fiscal_year_start_month: fiscalMonth,
        accounting_method: method,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onSaved();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("Business name is required."));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t("Edit Client")}</h2>
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
              {entityType === "i1040" ? t("Client Name") : t("Business Name")}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
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
              value={entityType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setEntityType(e.target.value as EntityType)
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

          <div>
            <label htmlFor="edit-ein" className="block text-sm font-medium text-gray-700 mb-1">
              {entityType === "i1040" ? t("SSN") : t("EIN")}{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="edit-ein"
              type="text"
              value={ein}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                let formatted: string;
                if (entityType === "i1040") {
                  if (digits.length > 5)
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
                  else if (digits.length > 3)
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  else formatted = digits;
                } else {
                  formatted =
                    digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
                }
                setEin(formatted);
              }}
              placeholder={entityType === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
              maxLength={entityType === "i1040" ? 11 : 10}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label
              htmlFor="edit-source-folder-path"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("Source Folder Path")}
            </label>
            <div className="space-y-2">
              <input
                id="edit-source-folder-path"
                type="text"
                value={sourceFolderPath}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSourceFolderPath(e.target.value)}
                placeholder={t("No source folder saved")}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const folderPath = await pickClientFolder();
                    if (folderPath) {
                      setSourceFolderPath(folderPath);
                    }
                  }}
                  disabled={mutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FolderSearch className="h-3.5 w-3.5" />
                  {t("Choose Folder")}
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFolderPath("")}
                  disabled={mutation.isPending || !sourceFolderPath.trim()}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("Clear")}
                </button>
                <button
                  type="button"
                  onClick={() => openPath(sourceFolderPath).catch(() => {})}
                  disabled={mutation.isPending || !sourceFolderPath.trim()}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t("Open Folder")}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t("Inspect or update the folder used for imports.")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-contact-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("Contact Name")}
              </label>
              <input
                id="edit-contact-name"
                type="text"
                value={contactName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setContactName(e.target.value)}
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
                type="text"
                value={phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Email")}
              </label>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label
                htmlFor="edit-website"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("Website")}
              </label>
              <input
                id="edit-website"
                type="text"
                value={website}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-address1" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Address Line 1")}
            </label>
            <input
              id="edit-address1"
              type="text"
              value={addressLine1}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAddressLine1(e.target.value)}
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
              value={addressLine2}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAddressLine2(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-city" className="block text-sm font-medium text-gray-700 mb-1">
                {t("City")}
              </label>
              <input
                id="edit-city"
                type="text"
                value={city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCity(e.target.value)}
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
                value={stateName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStateName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-postal" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Postal Code")}
              </label>
              <input
                id="edit-postal"
                type="text"
                value={postalCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPostalCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label
                htmlFor="edit-country"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("Country")}
              </label>
              <input
                id="edit-country"
                type="text"
                value={country}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-fiscal" className="block text-sm font-medium text-gray-700 mb-1">
              {t("Fiscal Year Start")}
            </label>
            <select
              id="edit-fiscal"
              value={fiscalMonth}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setFiscalMonth(Number(e.target.value))
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {t(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                {t("Accounting Method")}
              </legend>
              <div className="flex gap-6">
                {(["cash", "accrual"] as AccountingMethod[]).map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-method"
                      value={m}
                      checked={method === m}
                      onChange={() => setMethod(m)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      disabled={mutation.isPending}
                    />
                    <span className="text-sm text-gray-700">
                      {m === "cash" ? t("Cash") : t("Accrual")}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <label
              htmlFor="edit-tax-preparer-notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("Tax Preparer Notes")}
            </label>
            <textarea
              id="edit-tax-preparer-notes"
              value={taxPreparerNotes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setTaxPreparerNotes(e.target.value)
              }
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label
              htmlFor="edit-filing-notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("Filing Notes")}
            </label>
            <textarea
              id="edit-filing-notes"
              value={filingNotes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFilingNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
