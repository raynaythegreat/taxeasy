import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  type ContractorPayment,
  type CreateVendorPayload,
  type Generated1099Nec,
  type RecordPaymentPayload,
  type UpdateVendorPayload,
  type Vendor,
  createVendor,
  deleteVendor,
  generate1099Nec,
  listContractorPayments,
  listGenerated1099Nec,
  listVendors,
  recordContractorPayment,
  updateVendor,
} from "../../lib/vendors-1099-api";
import { getActiveClientId } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

export function VendorsPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState<Vendor | null>(null);
  const [viewing1099s, setViewing1099s] = useState(false);

  const clientId = getActiveClientId();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["vendors", clientId],
    queryFn: listVendors,
  });

  const { data: forms1099 } = useQuery({
    queryKey: ["1099-nec-forms", clientId, selectedYear],
    queryFn: () => listGenerated1099Nec(selectedYear),
    enabled: viewing1099s && !!clientId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateVendorPayload) => createVendor(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setEditingVendor(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateVendorPayload) => updateVendor(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setEditingVendor(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vendorId: string) => deleteVendor(vendorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });

  const generate1099Mutation = useMutation({
    mutationFn: ({ vendorId, year }: { vendorId: string; year: number }) =>
      generate1099Nec(vendorId, year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["1099-nec-forms"] });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const formatSSN = (ssn?: string) => {
    if (!ssn) return "—";
    return `***-**-${ssn.slice(-4)}`;
  };

  const maskEin = (ein?: string) => {
    if (!ein) return "—";
    return `${ein.slice(0, 2)}-***${ein.slice(-4)}`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label={t("Back")}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {viewing1099s ? t("1099-NEC Forms") : t("Vendors & Contractors")}
              </h1>
              <p className="text-sm text-gray-500">
                {viewing1099s
                  ? t("Generate and view 1099-NEC forms")
                  : t("Manage vendors and track contractor payments")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!viewing1099s && (
              <>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[2023, 2024, 2025, 2026].map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setViewing1099s(true)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                >
                  {t("View 1099s")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingVendor({} as Vendor)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  {t("Add Vendor")}
                </button>
              </>
            )}
            {viewing1099s && (
              <>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[2023, 2024, 2025, 2026].map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setViewing1099s(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                >
                  {t("Back to Vendors")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        {viewing1099s ? (
          <Forms1099View
            forms={forms1099 || []}
            vendors={vendors || []}
            onGenerate={(vendorId) => generate1099Mutation.mutate({ vendorId, year: selectedYear })}
            isGenerating={generate1099Mutation.isPending}
          />
        ) : editingVendor ? (
          <VendorForm
            vendor={editingVendor.id ? editingVendor : null}
            onSubmit={(payload) =>
              editingVendor.id
                ? updateMutation.mutate({ ...payload, vendor_id: editingVendor.id })
                : createMutation.mutate(payload)
            }
            onCancel={() => setEditingVendor(null)}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        ) : showPaymentForm ? (
          <PaymentForm
            vendor={showPaymentForm}
            onSubmit={(payload) => {
              recordContractorPayment(payload).then(() => {
                queryClient.invalidateQueries({ queryKey: ["vendors"] });
                setShowPaymentForm(null);
              });
            }}
            onCancel={() => setShowPaymentForm(null)}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-gray-500">{t("Loading vendors...")}</div>
          </div>
        ) : !vendors || vendors.length === 0 ? (
          <EmptyState
            icon={<User className="w-12 h-12 text-gray-300" />}
            title={t("No vendors yet")}
            description={t("Add your first vendor or contractor to get started.")}
            action={{ label: t("Add Vendor"), onClick: () => setEditingVendor({} as Vendor) }}
          />
        ) : (
          <VendorsTable
            vendors={vendors}
            year={selectedYear}
            onEdit={(vendor) => setEditingVendor(vendor)}
            onDelete={(id) => deleteMutation.mutate(id)}
            onRecordPayment={(vendor) => setShowPaymentForm(vendor)}
            onGenerate1099={(vendorId) =>
              generate1099Mutation.mutate({ vendorId, year: selectedYear })
            }
          />
        )}
      </div>
    </div>
  );
}

function VendorsTable({
  vendors,
  year,
  onEdit,
  onDelete,
  onRecordPayment,
  onGenerate1099,
}: {
  vendors: Vendor[];
  year: number;
  onEdit: (vendor: Vendor) => void;
  onDelete: (id: string) => void;
  onRecordPayment: (vendor: Vendor) => void;
  onGenerate1099: (vendorId: string) => void;
}) {
  const { t } = useI18n();

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const maskEin = (ein?: string) => {
    if (!ein) return "—";
    return `${ein.slice(0, 2)}-***${ein.slice(-4)}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("Vendor")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("EIN/SSN")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              {t("Contact")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
              {t("Total Payments")}
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              {t("1099 Required")}
            </th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vendors.map((vendor) => (
            <tr key={vendor.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                  {vendor.address_line1 && (
                    <div className="text-xs text-gray-500">
                      {[vendor.address_line1, vendor.city, vendor.state, vendor.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{maskEin(vendor.ein)}</td>
              <td className="px-4 py-3">
                {vendor.email && <div className="text-sm text-gray-700">{vendor.email}</div>}
                {vendor.phone && <div className="text-xs text-gray-500">{vendor.phone}</div>}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                <span className="font-medium text-gray-900">
                  {formatCurrency(vendor.total_payments_cents)}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {vendor.is_1099_required ? (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                    {t("Yes")}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                    {t("No")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onRecordPayment(vendor)}
                  className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 mr-1"
                  title={t("Record Payment")}
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onGenerate1099(vendor.id)}
                  className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 mr-1"
                  title={t("Generate 1099")}
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(vendor)}
                  className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 mr-1"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(vendor.id)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VendorForm({
  vendor,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  vendor: Vendor | null;
  onSubmit: (payload: CreateVendorPayload | UpdateVendorPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState({
    name: vendor?.name || "",
    ein: vendor?.ein || "",
    address_line1: vendor?.address_line1 || "",
    address_line2: vendor?.address_line2 || "",
    city: vendor?.city || "",
    state: vendor?.state || "",
    postal_code: vendor?.postal_code || "",
    phone: vendor?.phone || "",
    email: vendor?.email || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.name) return;
    onSubmit(payload as CreateVendorPayload);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {vendor?.id ? t("Edit Vendor") : t("New Vendor")}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("Vendor Name")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={payload.name}
            onChange={(e) => setPayload({ ...payload, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("EIN")}</label>
          <input
            type="text"
            value={payload.ein}
            onChange={(e) => setPayload({ ...payload, ein: e.target.value })}
            placeholder="XX-XXXXXXX"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t("Required for 1099-NEC reporting (threshold: $600)")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("Address Line 1")}
            </label>
            <input
              type="text"
              value={payload.address_line1}
              onChange={(e) => setPayload({ ...payload, address_line1: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("Address Line 2")}
            </label>
            <input
              type="text"
              value={payload.address_line2}
              onChange={(e) => setPayload({ ...payload, address_line2: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("City")}</label>
            <input
              type="text"
              value={payload.city}
              onChange={(e) => setPayload({ ...payload, city: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("State")}</label>
            <input
              type="text"
              value={payload.state}
              onChange={(e) => setPayload({ ...payload, state: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("Postal Code")}
            </label>
            <input
              type="text"
              value={payload.postal_code}
              onChange={(e) => setPayload({ ...payload, postal_code: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Phone")}</label>
            <input
              type="tel"
              value={payload.phone}
              onChange={(e) => setPayload({ ...payload, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Email")}</label>
            <input
              type="email"
              value={payload.email}
              onChange={(e) => setPayload({ ...payload, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
          >
            {isSubmitting ? t("Saving...") : t("Save Vendor")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={cn(
              "px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50",
              isSubmitting && "opacity-50 cursor-not-allowed"
            )}
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function PaymentForm({
  vendor,
  onSubmit,
  onCancel,
}: {
  vendor: Vendor;
  onSubmit: (payload: RecordPaymentPayload) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<RecordPaymentPayload>({
    vendor_id: vendor.id,
    transaction_id: "",
    amount_cents: 0,
    payment_date: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.amount_cents || !payload.payment_date) return;
    onSubmit(payload);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {t("Record Payment for")} {vendor.name}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("Payment Date")}
          </label>
          <input
            type="date"
            value={payload.payment_date}
            onChange={(e) => setPayload({ ...payload, payment_date: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("Amount ($")}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={payload.amount_cents / 100}
            onChange={(e) =>
              setPayload({ ...payload, amount_cents: Math.round(Number(e.target.value) * 100) })
            }
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("Transaction ID (optional)")}
          </label>
          <input
            type="text"
            value={payload.transaction_id}
            onChange={(e) => setPayload({ ...payload, transaction_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            {t("Record Payment")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Forms1099View({
  forms,
  vendors,
  onGenerate,
  isGenerating,
}: {
  forms: Generated1099Nec[];
  vendors: Vendor[];
  onGenerate: (vendorId: string) => void;
  isGenerating: boolean;
}) {
  const { t } = useI18n();

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const getVendorName = (vendorId: string) => {
    return vendors.find((v) => v.id === vendorId)?.name || vendorId;
  };

  return (
    <div className="space-y-6">
      {forms.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12 text-gray-300" />}
          title={t("No 1099-NEC forms yet")}
          description={t("Generate 1099-NEC forms for vendors with payments over $600.")}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  {t("Vendor")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  {t("Tax Year")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  {t("Box 1: Nonemployee Compensation")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  {t("Generated")}
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {forms.map((form) => (
                <tr key={form.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {getVendorName(form.vendor_id)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{form.tax_year}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(form.box1_nonemployee_compensation)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(form.generated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={!form.pdf_path}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t("Download PDF")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vendors needing 1099 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {t("Vendors Needing 1099-NEC")}
        </h3>
        <div className="space-y-2">
          {vendors
            .filter((v) => v.is_1099_required && v.total_payments_cents >= 60000)
            .map((vendor) => (
              <div
                key={vendor.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(vendor.total_payments_cents)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onGenerate(vendor.id)}
                  disabled={isGenerating}
                  className={cn(
                    "px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isGenerating ? t("Generating...") : t("Generate 1099")}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Import FileText and Edit icons
import { FileText, Edit } from "lucide-react";
