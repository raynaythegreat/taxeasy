import { ArrowLeft, Pencil, Trash2, ChevronDown } from "lucide-react";
import type { InvoiceDetail } from "../../lib/invoice-api";
import { centsToDollars } from "../../lib/invoice-api";
import { cn, formatDate } from "../../lib/utils";

interface InvoiceDetailPanelProps {
  invoice: InvoiceDetail;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onBack: () => void;
}

const TYPE_BADGE: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-700",
  receipt: "bg-green-100 text-green-700",
  estimate: "bg-purple-100 text-purple-700",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-amber-100 text-amber-700",
};

const TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  estimate: "Estimate",
};

const STATUS_FLOW: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  paid: [],
  cancelled: ["draft"],
};

export function InvoiceDetailPanel({
  invoice,
  onEdit,
  onDelete,
  onStatusChange,
  onBack,
}: InvoiceDetailPanelProps) {
  const nextStatuses = STATUS_FLOW[invoice.status] ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">
            {invoice.invoice_number}
          </h1>
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
              TYPE_BADGE[invoice.invoice_type]
            )}
          >
            {TYPE_LABEL[invoice.invoice_type]}
          </span>
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize shrink-0",
              STATUS_BADGE[invoice.status]
            )}
          >
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-red-300 bg-white text-red-600 rounded hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          {nextStatuses.length > 0 && (
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Status
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 hidden group-hover:block min-w-[120px]">
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusChange(s)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 capitalize"
                  >
                    Mark as {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Client
            </h3>
            <p className="text-sm text-gray-900 font-medium">{invoice.client_name}</p>
            {invoice.client_email && (
              <p className="text-sm text-gray-600 mt-0.5">{invoice.client_email}</p>
            )}
            {invoice.client_address && (
              <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">
                {invoice.client_address}
              </p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Dates
            </h3>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Issued</span>
                <span className="text-gray-900">{formatDate(invoice.issue_date)}</span>
              </div>
              {invoice.due_date && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Due</span>
                  <span
                    className={cn(
                      invoice.status === "overdue" && "text-red-600 font-medium"
                    )}
                  >
                    {formatDate(invoice.due_date)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {invoice.transaction_id && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
            <span className="text-gray-500">Linked Transaction: </span>
            <span className="text-gray-700 font-mono">{invoice.transaction_id}</span>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Line Items
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">
                    Qty
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                    Price
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((line) => (
                    <tr key={line.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-900">{line.description}</td>
                      <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                        {line.quantity}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                        ${centsToDollars(line.unit_price_cents)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900 font-medium tabular-nums">
                        ${centsToDollars(line.total_cents)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-700 tabular-nums">
                ${centsToDollars(invoice.subtotal_cents)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax ({invoice.tax_rate}%)</span>
              <span className="text-gray-700 tabular-nums">
                ${centsToDollars(invoice.tax_cents)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1.5">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900 tabular-nums">
                ${centsToDollars(invoice.total_cents)}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes
            </h3>
            <p className="text-sm text-gray-600 whitespace-pre-line bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
