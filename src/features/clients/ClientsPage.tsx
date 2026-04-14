import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Archive } from "lucide-react";
import {
  listClients,
  createClient,
  switchClient,
  getActiveClientId,
  setActiveClientPref,
} from "../../lib/tauri";
import type { Client, EntityType, AccountingMethod, CreateClientPayload } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { ClientWorkspace } from "../../components/ClientWorkspace";
import { ClientEditModal } from "./ClientEditModal";
import { ClientArchiveConfirm } from "./ClientArchiveConfirm";

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<EntityType, string> = {
  sole_prop: "Sole Proprietor",
  smllc: "SMLLC",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── New-client form state ─────────────────────────────────────────────────────

interface NewClientForm {
  name: string;
  entity_type: EntityType;
  ein: string;
  fiscal_year_start_month: number;
  accounting_method: AccountingMethod;
}

const DEFAULT_FORM: NewClientForm = {
  name: "",
  entity_type: "sole_prop",
  ein: "",
  fiscal_year_start_month: 1,
  accounting_method: "cash",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function EntityBadge({ type }: { type: EntityType }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      {t(ENTITY_LABELS[type])}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-5 h-5 text-blue-600"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientsPage({ initialClientId, onBack }: {
  initialClientId?: string | null;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeClientId, setActiveClientId] = useState<string | null>(initialClientId ?? null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewClientForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [archivingClient, setArchivingClient] = useState<Client | null>(null);

  // Load active client on mount (or switch to initialClientId if provided)
  useEffect(() => {
    if (initialClientId) {
      handleSwitchClient(initialClientId);
    } else {
      getActiveClientId()
        .then(setActiveClientId)
        .catch(() => {
          // Non-fatal: we just won't highlight any client
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Query: list clients
  const {
    data: clients,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  // Mutation: create client
  const createMutation = useMutation({
    mutationFn: (payload: CreateClientPayload) => createClient(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setFormError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to create client: ${msg}`);
    },
  });

  // Handle client switch
  async function handleSwitchClient(clientId: string) {
    setSwitchError(null);
    try {
      await switchClient(clientId);
      setActiveClientId(clientId);
      // Persist for restore on next launch (non-fatal if it fails)
      setActiveClientPref(clientId).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSwitchError(`Could not switch client: ${msg}`);
    }
  }

  // Handle form field changes (immutable pattern)
  function updateField<K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }

  // Handle form submission
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError(t("Business name is required."));
      return;
    }

    const payload: CreateClientPayload = {
      name: trimmedName,
      entity_type: form.entity_type,
      fiscal_year_start_month: form.fiscal_year_start_month,
      accounting_method: form.accounting_method,
    };

    const trimmedEin = form.ein.trim();
    if (trimmedEin) {
      payload.ein = trimmedEin;
    }

    createMutation.mutate(payload);
  }

  function handleCancelForm() {
    setShowForm(false);
    setForm(DEFAULT_FORM);
    setFormError(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title={t("Back to Dashboard")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {t("Clients")}
            </h2>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("New Client")}
            </button>
          )}
        </div>

        {/* Switch error */}
        {switchError && (
          <div
            role="alert"
            className="mx-3 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {switchError}
          </div>
        )}

        {/* Client list */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          )}

          {isError && (
            <div
              role="alert"
              className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {fetchError instanceof Error
                ? fetchError.message
                : t("Failed to load clients.")}
            </div>
          )}

          {!isLoading && !isError && clients && clients.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <svg
                className="w-10 h-10 text-gray-300 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"
                />
              </svg>
              <p className="text-sm text-gray-500">No clients yet.</p>
              <p className="text-xs text-gray-400 mt-1">Create your first client.</p>
            </div>
          )}

          {!isLoading && clients && clients.length > 0 && (
            <ul role="list">
              {clients.map((client) => {
                const isActive = client.id === activeClientId;
                return (
                  <li key={client.id} className="group">
                    <button
                      onClick={() => handleSwitchClient(client.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 flex items-center gap-2 border-l-2 transition-colors hover:bg-gray-50 focus:outline-none focus:bg-gray-50",
                        isActive
                          ? "border-l-blue-600 bg-blue-50 hover:bg-blue-50"
                          : "border-l-transparent"
                      )}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-medium truncate",
                            isActive ? "text-blue-700" : "text-gray-800"
                          )}
                        >
                          {client.name}
                        </span>
                        <EntityBadge type={client.entity_type} />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingClient(client);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              setEditingClient(client);
                            }
                          }}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title={t("Edit client")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchivingClient(client);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              setArchivingClient(client);
                            }
                          }}
                          className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                          title={t("Archive client")}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 min-w-0 overflow-hidden bg-gray-50">
        {showForm ? (
          /* ── New Client Form ── */
          <div className="p-6 max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">{t("New Client")}</h2>

            <form onSubmit={handleSubmit} noValidate className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
              {/* Business Name */}
              <div>
                <label
                  htmlFor="client-name"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {t("Business Name")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={form.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField("name", e.target.value)
                  }
                  placeholder="Acme Consulting LLC"
                  autoFocus
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
              </div>

              {/* Entity Type */}
              <div>
                <label
                  htmlFor="entity-type"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {t("Entity Type")}
                </label>
                <select
                  id="entity-type"
                  value={form.entity_type}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    updateField("entity_type", e.target.value as EntityType)
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                >
                  <option value="sole_prop">{t("Sole Proprietor")}</option>
                  <option value="smllc">SMLLC</option>
                  <option value="scorp">S-Corp</option>
                  <option value="ccorp">C-Corp</option>
                  <option value="partnership">{t("Partnership")}</option>
                </select>
              </div>

              {/* EIN */}
              <div>
                <label
                  htmlFor="ein"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {t("EIN")}{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="ein"
                  type="text"
                  value={form.ein}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    const formatted = digits.length > 2
                      ? digits.slice(0, 2) + "-" + digits.slice(2)
                      : digits;
                    updateField("ein", formatted);
                  }}
                  placeholder="XX-XXXXXXX"
                  maxLength={10}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
                <p className="mt-1 text-xs text-gray-400">Format: XX-XXXXXXX</p>
              </div>

              {/* Fiscal Year Start */}
              <div>
                <label
                  htmlFor="fiscal-year-start"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {t("Fiscal Year Start")}
                </label>
                <select
                  id="fiscal-year-start"
                  value={form.fiscal_year_start_month}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    updateField("fiscal_year_start_month", Number(e.target.value))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                >
                  {MONTHS.map((month, idx) => (
                    <option key={month} value={idx + 1}>
                      {t(month)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Accounting Method */}
              <div>
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 mb-2">
                    {t("Accounting Method")}
                  </legend>
                  <div className="flex gap-6">
                    {(["cash", "accrual"] as AccountingMethod[]).map((method) => (
                      <label
                        key={method}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="accounting-method"
                          value={method}
                          checked={form.accounting_method === method}
                          onChange={() => updateField("accounting_method", method)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          disabled={createMutation.isPending}
                        />
                        <span className="text-sm text-gray-700">{method === "cash" ? t("Cash") : t("Accrual")}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* Form error */}
              {formError && (
                <div
                  role="alert"
                  className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createMutation.isPending ? (
                    <>
                      <Spinner />
                      {t("Creating…")}
                    </>
                  ) : (
                    t("Create Client")
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  disabled={createMutation.isPending}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          </div>
        ) : activeClientId && clients?.find((c) => c.id === activeClientId) ? (
          <ClientWorkspace
            key={activeClientId}
            client={clients.find((c) => c.id === activeClientId)!}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Select a client from the sidebar to get started.
              </p>
            </div>
          </div>
        )}
      </main>

      {editingClient && (
        <ClientEditModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => setEditingClient(null)}
        />
      )}

      {archivingClient && (
        <ClientArchiveConfirm
          client={archivingClient}
          onClose={() => setArchivingClient(null)}
          onArchived={() => setArchivingClient(null)}
        />
      )}
    </div>
  );
}
