import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Receipt,
  Calculator,
  Pencil,
  Trash2,
  ChevronRight,
  FilePlus2,
} from "lucide-react";
import {
  listInvoices,
  getInvoice,
  deleteInvoice,
  updateInvoiceStatus,
  centsToDollars,
} from "../../lib/invoice-api";
import type { InvoiceDetail, InvoiceType } from "../../lib/invoice-api";
import { cn, formatDate } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { InvoiceForm } from "./InvoiceForm";
import { InvoiceDetailPanel } from "./InvoiceDetailPanel";

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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

interface ClientInvoiceHistoryProps {
  clientName: string;
}

export function ClientInvoiceHistory({ clientName }: ClientInvoiceHistoryProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formInvoice, setFormInvoice] = useState<InvoiceDetail | undefined>();
  const [formDefaultType, setFormDefaultType] = useState<InvoiceType>("invoice");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
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

  const openCreate = useCallback(
    (type: InvoiceType) => {
      setFormInvoice({
        id: "",
        invoice_number: "",
        invoice_type: type,
        status: "draft",
        issue_date: "",
        due_date: null,
        client_name: clientName,
        subtotal_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        transaction_id: null,
        created_at: "",
        client_email: null,
        client_address: null,
        notes: null,
        tax_rate: 0,
        lines: [],
      } as InvoiceDetail);
      setFormDefaultType(type);
      setShowForm(true);
    },
    [clientName]
  );

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
        onDelete={() => setDeleteConfirm(detail.id)}
        onStatusChange={(status) =>
          statusMutation.mutate({ id: detail.id, status })
        }
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.total_cents, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">
          {t("Invoice History")}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate("receipt")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            <Receipt className="w-4 h-4" />
            {t("New Receipt")}
          </button>
          <button
            type="button"
            onClick={() => openCreate("estimate")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
          >
            <Calculator className="w-4 h-4" />
            {t("New Estimate")}
          </button>
          <button
            type="button"
            onClick={() => openCreate("invoice")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            {t("New Invoice")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 font-medium">{t("Total")}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">
            {invoices.length}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600 font-medium">{t("Paid")}</p>
          <p className="text-lg font-bold text-green-700 mt-0.5">{paidCount}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600 font-medium">
            {t("Outstanding")}
          </p>
          <p className="text-lg font-bold text-blue-700 mt-0.5">
            ${centsToDollars(totalOutstanding)}
          </p>
        </div>
        <div
          className={cn(
            "border rounded-lg p-3 text-center",
            overdueCount > 0
              ? "bg-red-50 border-red-200"
              : "bg-gray-50 border-gray-200"
          )}
        >
          <p
            className={cn(
              "text-xs font-medium",
              overdueCount > 0 ? "text-red-600" : "text-gray-500"
            )}
          >
            {t("Overdue")}
          </p>
          <p
            className={cn(
              "text-lg font-bold mt-0.5",
              overdueCount > 0 ? "text-red-700" : "text-gray-400"
            )}
          >
            {overdueCount}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FilePlus2 className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">
              {t("No invoices yet")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("Create your first invoice to get started.")}
            </p>
            <button
              type="button"
              onClick={() => openCreate("invoice")}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("New Invoice")}
            </button>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {t("#")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Type")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {t("Issue Date")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {t("Due Date")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                  {t("Total")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("Status")}
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
                  {t("Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => setSelectedId(inv.id)}
                >
                  <td className="px-4 py-2.5 text-sm text-gray-900 font-medium whitespace-nowrap">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                        TYPE_BADGE[inv.invoice_type]
                      )}
                    >
                      {t(TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type)}
                    </span>
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
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-medium tabular-nums">
                    ${centsToDollars(inv.total_cents)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                        STATUS_BADGE[inv.status]
                      )}
                    >
                      {t(STATUS_LABEL[inv.status] ?? inv.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {deleteConfirm === inv.id ? (
                        <>
                          <span className="text-xs text-red-600 mr-1">
                            {t("Delete?")}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(inv.id);
                            }}
                            className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            {t("Yes")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(null);
                            }}
                            className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          >
                            {t("No")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              getInvoice(inv.id).then((d) => {
                                setFormInvoice(d);
                                setShowForm(true);
                              });
                            }}
                            title={t("Edit")}
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
                            title={t("Delete")}
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
            <tfoot>
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100"
                >
                  {t("Showing {count} documents", {
                    count: String(invoices.length),
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
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
