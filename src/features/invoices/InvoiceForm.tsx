import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import { createInvoice, updateInvoice } from "../../lib/invoice-api";
import type {
  InvoiceDetail,
  InvoiceType,
  CreateInvoiceLinePayload,
} from "../../lib/invoice-api";
import { cn, today } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface InvoiceFormProps {
  invoice?: InvoiceDetail;
  defaultType?: InvoiceType;
  onClose: () => void;
  onSaved: () => void;
}

interface LineState {
  description: string;
  quantity: string;
  unitPrice: string;
}

const TYPE_OPTIONS: { value: InvoiceType; label: string; prefix: string }[] = [
  { value: "invoice", label: "Invoice", prefix: "INV" },
  { value: "receipt", label: "Receipt", prefix: "REC" },
  { value: "estimate", label: "Estimate", prefix: "EST" },
];

function emptyLine(): LineState {
  return { description: "", quantity: "1", unitPrice: "" };
}

function linesToPayload(lines: LineState[]): CreateInvoiceLinePayload[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: parseFloat(l.quantity) || 1,
    unit_price_cents: Math.round((parseFloat(l.unitPrice) || 0) * 100),
  }));
}

function payloadToLines(lines: InvoiceDetail["lines"]): LineState[] {
  if (!lines.length) return [emptyLine()];
  return lines
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: (l.unit_price_cents / 100).toFixed(2),
    }));
}

export function InvoiceForm({ invoice, defaultType, onClose, onSaved }: InvoiceFormProps) {
  const { t } = useI18n();
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(
    invoice?.invoice_type ?? defaultType ?? "invoice"
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice?.invoice_number ?? "INV-001"
  );
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? today());
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [clientName, setClientName] = useState(invoice?.client_name ?? "");
  const [clientEmail, setClientEmail] = useState(invoice?.client_email ?? "");
  const [clientAddress, setClientAddress] = useState(invoice?.client_address ?? "");
  const [taxRate, setTaxRate] = useState(
    invoice ? String(invoice.tax_rate) : "0"
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    invoice ? payloadToLines(invoice.lines) : [emptyLine()]
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        invoice_number: invoiceNumber,
        invoice_type: invoiceType,
        issue_date: issueDate,
        due_date: dueDate || undefined,
        client_name: clientName,
        client_email: clientEmail || undefined,
        client_address: clientAddress || undefined,
        tax_rate: parseFloat(taxRate) || 0,
        notes: notes || undefined,
        lines: linesToPayload(lines),
      };
      if (invoice) {
        return updateInvoice(invoice.id, {
          invoice_number: payload.invoice_number,
          issue_date: payload.issue_date,
          due_date: payload.due_date || null,
          client_name: payload.client_name,
          client_email: payload.client_email || null,
          client_address: payload.client_address || null,
          tax_rate: payload.tax_rate,
          notes: payload.notes || null,
          lines: payload.lines,
        });
      }
      return createInvoice(payload);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  function updateLine(index: number, field: keyof LineState, value: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const taxAmount = subtotal * ((parseFloat(taxRate) || 0) / 100);
  const total = subtotal + taxAmount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) {
      setError(t("Client name is required."));
      return;
    }
    if (!issueDate) {
      setError(t("Issue date is required."));
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.description.trim())) {
      setError(t("At least one line item with a description is required."));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40">
      <div className="h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">
            {invoice ? t("Edit") : t("New")} {invoiceType === "invoice" ? t("Invoice") : invoiceType === "receipt" ? t("Receipt") : t("Estimate")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setInvoiceType(opt.value)}
                className={cn(
                  "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                  invoiceType === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Document #")}
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Issue Date")}
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Due Date")}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Client Name")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t("Client or customer name")}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Client Email")}
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Client Address")}
              </label>
              <textarea
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder={t("Street, City, State, ZIP")}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("Line Items")}
            </label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t("Description")}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">
                      {t("Qty")}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                      {t("Unit Price")}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                      {t("Total")}
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const price = parseFloat(line.unitPrice) || 0;
                    const lineTotal = qty * price;
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => updateLine(i, "description", e.target.value)}
                            placeholder={t("Item description")}
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500 bg-white"
                            disabled={mutation.isPending}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateLine(i, "quantity", e.target.value)}
                            min="0"
                            step="1"
                            className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-500 bg-white tabular-nums"
                            disabled={mutation.isPending}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-500 bg-white tabular-nums"
                            disabled={mutation.isPending}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">
                          ${lineTotal.toFixed(2)}
                        </td>
                        <td className="px-1 py-1.5">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                              disabled={mutation.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-full transition-colors"
                  disabled={mutation.isPending}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("Add Line")}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("Tax Rate (%)")}
              </label>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min="0"
                max="100"
                step="0.01"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-1.5 pt-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t("Subtotal")}</span>
                <span className="text-gray-700 tabular-nums">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t("Tax")} ({taxRate || "0"}%)</span>
                <span className="text-gray-700 tabular-nums">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1.5">
                <span className="text-gray-900">{t("Total")}</span>
                <span className="text-gray-900 tabular-nums">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("Notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Payment terms, additional info…")}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={mutation.isPending}
            />
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 pb-4">
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
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {mutation.isPending ? t("Saving…") : invoice ? t("Update") : t("Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
