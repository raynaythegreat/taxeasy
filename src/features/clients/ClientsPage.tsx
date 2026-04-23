import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronLeft, ChevronRight, Pencil, Search, Users, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClientWorkspace, type WorkspaceTab } from "../../components/ClientWorkspace";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n } from "../../lib/i18n";
import { useSidebar } from "../../lib/sidebar";
import type { AccountingMethod, Client, CreateClientPayload, EntityType } from "../../lib/tauri";
import {
  createClient,
  getActiveClientId,
  listClients,
  setActiveClientPref,
  switchClient,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ClientArchiveConfirm } from "./ClientArchiveConfirm";
import { ClientEditModal } from "./ClientEditModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<EntityType, string> = {
  sole_prop: "Sole Proprietor",
  smllc: "SMLLC",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
  i1040: "1040 Individual",
};

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

type FilingStatus = "not_started" | "in_progress" | "filed" | "accepted";

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  filed: "Filed",
  accepted: "Accepted",
};

const FILING_STATUS_COLORS: Record<FilingStatus, string> = {
  not_started: "bg-gray-100 text-gray-500",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  filed: "bg-blue-50 text-blue-700 border border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border border-emerald-200",
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientsPage({
  initialClientId,
  initialTab,
  onBack,
  autoShowForm: autoShowFormProp,
}: {
  initialClientId?: string | null;
  initialTab?: WorkspaceTab;
  onBack: () => void;
  autoShowForm?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewClientForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [archivingClient, setArchivingClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filingStatuses, setFilingStatuses] = useState<Record<string, FilingStatus>>(() => {
    try {
      const stored = localStorage.getItem("filing_statuses");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const updateFilingStatus = useCallback((clientId: string, status: FilingStatus) => {
    setFilingStatuses((prev) => {
      const next = { ...prev, [clientId]: status };
      localStorage.setItem("filing_statuses", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    if (initialClientId) {
      setActiveClientId(initialClientId);
      switchClient(initialClientId).catch(() => {});
    } else {
      getActiveClientId()
        .then((id) => {
          if (id) setActiveClientId(id);
        })
        .catch(() => {});
    }
  }, [initialized, initialClientId]);

  useEffect(() => {
    if (autoShowFormProp) {
      setShowForm(true);
    }
  }, [autoShowFormProp]);

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

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase().trim();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, searchQuery]);

  // Handle client switch
  async function handleSwitchClient(clientId: string) {
    setSwitchError(null);
    try {
      await switchClient(clientId);
      setActiveClientId(clientId);
      setActiveClientPref(clientId).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSwitchError(`Could not switch client: ${msg}`);
    }
  }

  // Mutation: create client
  const createMutation = useMutation({
    mutationFn: (payload: CreateClientPayload) => createClient(payload),
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setFormError(null);
      handleSwitchClient(newClient.id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to create client: ${msg}`);
    },
  });

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

  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebar();

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200 print:hidden relative",
          sidebarCollapsed ? "w-16" : "w-80",
        )}
      >
        {/* Sidebar header — expanded */}
        {!sidebarCollapsed && (
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors group"
                title={t("Back to Dashboard")}
                aria-label={t("Back to Dashboard")}
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-medium">{t("Back")}</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">{t("Clients")}</h2>
              {!showForm && (
                <button
                  type="button"
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
                  {t("New")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sidebar header — collapsed */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-2 pt-4 pb-2">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={t("Back to Dashboard")}
              aria-label={t("Back to Dashboard")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title={t("New Client")}
                aria-label={t("New Client")}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Collapse toggle — edge button */}
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all",
            sidebarCollapsed && "right-1/2 translate-x-1/2",
          )}
          title={sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
          aria-label={sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>

        {/* Switch error */}
        {switchError && !sidebarCollapsed && (
          <div
            role="alert"
            className="mx-4 mt-1 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {switchError}
          </div>
        )}

        {/* Search bar */}
        {!sidebarCollapsed && !isLoading && clients && clients.length > 0 && (
          <div className="px-4 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search clients…")}
                className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        {!sidebarCollapsed && <div className="mx-4 mt-2 border-t border-gray-100" />}

        {/* Client list */}
        <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed ? "pt-1" : "pt-1")}>
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
              {fetchError instanceof Error ? fetchError.message : t("Failed to load clients.")}
            </div>
          )}

          {!isLoading && !isError && clients && clients.length === 0 && (
            <div className="px-3 py-4">
              <EmptyState
                icon={<Users className="w-6 h-6" />}
                title={t("No clients yet")}
                description={t("Create your first client to get started.")}
                action={{ label: t("New Client"), onClick: () => setShowForm(true) }}
              />
            </div>
          )}

          {!isLoading && clients && clients.length > 0 && filteredClients.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t("No clients match your search.")}
            </div>
          )}

          {!isLoading && clients && clients.length > 0 && (
            <ul>
              {filteredClients.map((client) => {
                const isActive = client.id === activeClientId;
                const initials =
                  client.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "?";
                const filingStatus = filingStatuses[client.id] ?? "not_started";
                if (sidebarCollapsed) {
                  return (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleSwitchClient(client.id)}
                        className={cn(
                          "w-full flex items-center justify-center py-2.5 transition-colors focus:outline-none relative",
                          isActive ? "bg-blue-50" : "hover:bg-gray-50",
                        )}
                        title={client.name}
                        aria-label={client.name}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
                            isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700",
                          )}
                        >
                          {initials}
                        </span>
                        {filingStatus !== "not_started" && (
                          <span
                            className={cn(
                              "absolute bottom-1.5 right-1/2 translate-x-[14px] w-2 h-2 rounded-full",
                              filingStatus === "accepted"
                                ? "bg-emerald-500"
                                : filingStatus === "filed"
                                  ? "bg-blue-500"
                                  : "bg-amber-500",
                            )}
                          />
                        )}
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={client.id} className="group px-2">
                    <button
                      type="button"
                      onClick={() => handleSwitchClient(client.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-lg transition-colors hover:bg-gray-50 focus:outline-none focus:bg-gray-50",
                        isActive ? "bg-blue-50 ring-1 ring-blue-200" : "",
                      )}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-medium truncate",
                              isActive ? "text-blue-700" : "text-gray-800",
                            )}
                          >
                            {client.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4",
                              FILING_STATUS_COLORS[filingStatus],
                            )}
                          >
                            {t(FILING_STATUS_LABELS[filingStatus])}
                          </span>
                        </div>
                        <EntityBadge type={client.entity_type} />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingClient(client);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title={t("Edit client")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next: Record<FilingStatus, FilingStatus> = {
                              not_started: "in_progress",
                              in_progress: "filed",
                              filed: "accepted",
                              accepted: "not_started",
                            };
                            updateFilingStatus(client.id, next[filingStatus]);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50"
                          title={t("Change filing status")}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchivingClient(client);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                          title={t("Archive client")}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
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
      <main className="flex-1 min-w-0 overflow-auto h-full bg-gray-50 print:w-full print:overflow-visible">
        {showForm ? (
          /* ── New Client Form ── */
          <div className="p-6 max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">{t("New Client")}</h2>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
            >
              {/* Client Type Toggle */}
              <div>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateField("entity_type", "i1040")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                      form.entity_type === "i1040"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    )}
                    disabled={createMutation.isPending}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    {t("Individual (1040)")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (form.entity_type === "i1040") updateField("entity_type", "sole_prop");
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-300",
                      form.entity_type !== "i1040"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    )}
                    disabled={createMutation.isPending}
                    aria-label={t("Business")}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    {t("Business")}
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="client-name"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {form.entity_type === "i1040" ? t("Client Name") : t("Business Name")}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={form.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField("name", e.target.value)
                  }
                  placeholder={form.entity_type === "i1040" ? "John Doe" : "Acme Consulting LLC"}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
              </div>

              {/* Entity Type — only shown for Business */}
              {form.entity_type !== "i1040" && (
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
              )}

              {/* SSN / EIN */}
              <div>
                <label htmlFor="ein" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {form.entity_type === "i1040" ? t("SSN") : t("EIN")}{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="ein"
                  type="text"
                  value={form.ein}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    let formatted: string;
                    if (form.entity_type === "i1040") {
                      if (digits.length > 5)
                        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
                      else if (digits.length > 3)
                        formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                      else formatted = digits;
                    } else {
                      formatted =
                        digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
                    }
                    updateField("ein", formatted);
                  }}
                  placeholder={form.entity_type === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                  maxLength={form.entity_type === "i1040" ? 11 : 10}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={createMutation.isPending}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Format: {form.entity_type === "i1040" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
                </p>
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
                      <label key={method} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="accounting-method"
                          value={method}
                          checked={form.accounting_method === method}
                          onChange={() => updateField("accounting_method", method)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          disabled={createMutation.isPending}
                        />
                        <span className="text-sm text-gray-700">
                          {method === "cash" ? t("Cash") : t("Accrual")}
                        </span>
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
            client={clients.find((c) => c.id === activeClientId) ?? clients[0]}
            initialTab={initialTab}
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
