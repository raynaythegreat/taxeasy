import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Receipt, Calculator, Pencil, Trash2, ChevronRight } from "lucide-react";
import { listInvoices, getInvoice, deleteInvoice, updateInvoiceStatus, centsToDollars } from "../../lib/invoice-api";
import type { InvoiceDetail, InvoiceType } from "../../lib/invoice-api";
import { cn, formatDate } from "../../lib/utils";
import { InvoiceForm } from "./InvoiceForm";
import { InvoiceDetailPanel } from "./InvoiceDetailPanel";

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "invoice", label: "Invoices" },
  { value: "receipt", label: "Receipts" },
  { value: "estimate", label: "Estimates" },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

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

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded" />
        </td>
      ))}
    </tr>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize",
        TYPE_BADGE[type]
      )}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize",
        STATUS_BADGE[status]
      )}
    >
      {status}
    </span>
  );
}

export function InvoicesPage() {
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formInvoice, setFormInvoice] = useState<InvoiceDetail | undefined>();
  const [formDefaultType, setFormDefaultType] = useState<InvoiceType>("invoice");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", typeFilter, statusFilter],
    queryFn: () =>
      listInvoices({
        invoiceType: typeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const { data: detail } = useQuery({
    queryKey: ["invoice", selectedId],
    queryFn: () => getInvoice(selectedId!),
    enabled: !!selectedId,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteConfirm(null);
      if (selectedId) setSelectedId(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateInvoiceStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", selectedId] });
    },
  });

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ["invoice", selectedId] });
    }
    setFormInvoice(undefined);
  }, [queryClient, selectedId]);

  const openCreate = useCallback((type: InvoiceType) => {
    setFormInvoice(undefined);
    setFormDefaultType(type);
    setShowForm(true);
  }, []);

  const openEdit = useCallback(() => {
    if (detail) {
      setFormInvoice(detail);
      setShowForm(true);
    }
  }, [detail]);

  if (selectedId && detail) {
    return (
      <InvoiceDetailPanel
        invoice={detail}
        onEdit={openEdit}
        onDelete={() => {
          setDeleteConfirm(detail.id);
        }}
        onStatusChange={(status) =>
          statusMutation.mutate({ id: detail.id, status })
        }
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-700">Invoices &amp; Receipts</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate("receipt")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            <Receipt className="w-4 h-4" />
            New Receipt
          </button>
          <button
            type="button"
            onClick={() => openCreate("estimate")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            <Calculator className="w-4 h-4" />
            New Estimate
          </button>
          <button
            type="button"
            onClick={() => openCreate("invoice")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                typeFilter === f.value
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                statusFilter === f.value
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                #
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Type
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Client
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                Issue Date
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                Due Date
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                Total
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}

            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">No invoices yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create your first invoice to get started.
                  </p>
                </td>
              </tr>
            )}

            {!isLoading &&
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => setSelectedId(inv.id)}
                >
                  <td className="px-4 py-2.5 text-sm text-gray-900 font-medium whitespace-nowrap">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-2.5">
                    <TypeBadge type={inv.invoice_type} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[200px] truncate">
                    {inv.client_name}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(inv.issue_date)}
                  </td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    {inv.due_date ? (
                      <span
                        className={cn(
                          inv.status === "overdue"
                            ? "text-red-600 font-medium"
                            : "text-gray-600"
                        )}
                      >
                        {formatDate(inv.due_date)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-medium tabular-nums">
                    ${centsToDollars(inv.total_cents)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {deleteConfirm === inv.id ? (
                        <>
                          <span className="text-xs text-red-600 mr-1">Delete?</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(inv.id);
                            }}
                            className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(null);
                            }}
                            className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormInvoice(undefined);
                              setFormDefaultType(inv.invoice_type);
                              getInvoice(inv.id).then((d) => {
                                setFormInvoice(d);
                                setShowForm(true);
                              });
                            }}
                            title="Edit"
                            className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(inv.id);
                            }}
                            title="Delete"
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
          {!isLoading && invoices.length > 0 && (
            <tfoot>
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100"
                >
                  Showing {invoices.length} document{invoices.length !== 1 ? "s" : ""}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showForm && (
        <InvoiceForm
          invoice={formInvoice}
          defaultType={formDefaultType}
          onClose={() => {
            setShowForm(false);
            setFormInvoice(undefined);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
