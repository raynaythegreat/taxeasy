import { useState, type FormEvent, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { updateClient } from "../../lib/client-api";
import type { Client, EntityType, AccountingMethod } from "../../lib/tauri";
import { cn } from "../../lib/utils";

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "sole_prop", label: "Sole Proprietor" },
  { value: "smllc", label: "SMLLC" },
  { value: "scorp", label: "S-Corp" },
  { value: "ccorp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ClientEditModalProps {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

export function ClientEditModal({ client, onClose, onSaved }: ClientEditModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(client.name);
  const [entityType, setEntityType] = useState<EntityType>(client.entity_type);
  const [ein, setEin] = useState(client.ein ?? "");
  const [fiscalMonth, setFiscalMonth] = useState(client.fiscal_year_start_month);
  const [method, setMethod] = useState<AccountingMethod>(client.accounting_method);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateClient(client.id, {
        name: name.trim(),
        entity_type: entityType,
        ein: ein.trim() || undefined,
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
      setError("Business name is required.");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Edit Client</h2>
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
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-entity" className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              id="edit-entity"
              value={entityType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setEntityType(e.target.value as EntityType)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-ein" className="block text-sm font-medium text-gray-700 mb-1">
              EIN <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="edit-ein"
              type="text"
              value={ein}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                const formatted = digits.length > 2 ? digits.slice(0, 2) + "-" + digits.slice(2) : digits;
                setEin(formatted);
              }}
              placeholder="XX-XXXXXXX"
              maxLength={10}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <label htmlFor="edit-fiscal" className="block text-sm font-medium text-gray-700 mb-1">
              Fiscal Year Start
            </label>
            <select
              id="edit-fiscal"
              value={fiscalMonth}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFiscalMonth(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={mutation.isPending}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">Accounting Method</legend>
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
                    <span className="text-sm text-gray-700 capitalize">{m}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
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
              Cancel
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
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
