import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  type CreateAccountPayload,
  createAccount,
  toggleAccountActive,
  type UpdateAccountPayload,
  updateAccount,
} from "../../lib/account-api";
import { useI18n } from "../../lib/i18n";
import type { Account, AccountType } from "../../lib/tauri";
import { listAccounts } from "../../lib/tauri";
import { cn } from "../../lib/utils";

const ACCOUNT_TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset: "bg-blue-100 text-blue-700",
  liability: "bg-orange-100 text-orange-700",
  equity: "bg-purple-100 text-purple-700",
  revenue: "bg-green-100 text-green-700",
  expense: "bg-amber-100 text-amber-700",
};

const ACCOUNT_TYPE_DOT: Record<AccountType, string> = {
  asset: "bg-blue-500",
  liability: "bg-orange-500",
  equity: "bg-purple-500",
  revenue: "bg-green-500",
  expense: "bg-amber-500",
};

interface AccountFormState {
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string;
  schedule_c_line: string;
}

const EMPTY_FORM: AccountFormState = {
  code: "",
  name: "",
  account_type: "asset",
  parent_id: "",
  schedule_c_line: "",
};

function TypeBadge({ type }: { type: AccountType }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
        ACCOUNT_TYPE_COLORS[type],
      )}
    >
      {t(ACCOUNT_TYPE_LABELS[type])}
    </span>
  );
}

export function AccountManagementPage({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AccountFormState>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AccountFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.schedule_c_line?.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const grouped = useMemo(() => {
    const result: Record<AccountType, Account[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: [],
    };
    for (const a of filtered) {
      result[a.account_type].push(a);
    }
    return result;
  }, [filtered]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateAccountPayload) => createAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setShowAddForm(false);
      setAddForm(EMPTY_FORM);
      setAddError(null);
    },
    onError: (err: unknown) => {
      setAddError(err instanceof Error ? err.message : String(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAccountPayload }) =>
      updateAccount(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingId(null);
      setEditForm(EMPTY_FORM);
      setEditError(null);
    },
    onError: (err: unknown) => {
      setEditError(err instanceof Error ? err.message : String(err));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleAccountActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  function toggleGroup(type: string) {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.code.trim() || !addForm.name.trim()) {
      setAddError(t("Code and name are required."));
      return;
    }
    setAddError(null);
    createMutation.mutate({
      code: addForm.code.trim(),
      name: addForm.name.trim(),
      account_type: addForm.account_type,
      parent_id: addForm.parent_id || undefined,
      schedule_c_line: addForm.schedule_c_line.trim() || undefined,
    });
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setEditForm({
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      parent_id: account.parent_id ?? "",
      schedule_c_line: account.schedule_c_line ?? "",
    });
    setEditError(null);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.code.trim() || !editForm.name.trim()) {
      setEditError(t("Code and name are required."));
      return;
    }
    if (!editingId) return;
    setEditError(null);
    updateMutation.mutate({
      id: editingId,
      payload: {
        code: editForm.code.trim(),
        name: editForm.name.trim(),
        schedule_c_line: editForm.schedule_c_line.trim() || undefined,
      },
    });
  }

  if (compact) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {t("Accounts")}
          </h2>
        </div>
        <div className="space-y-1 max-h-48 overflow-auto">
          {filtered.slice(0, 8).map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500 dark:text-neutral-400">
                  {account.code}
                </span>
                <span className="text-sm text-gray-700 dark:text-neutral-300">{account.name}</span>
              </div>
              <TypeBadge type={account.account_type} />
            </div>
          ))}
        </div>
        {filtered.length > 8 && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            {filtered.length - 8} more accounts...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-700">{t("Chart of Accounts")}</h1>
        <button
          type="button"
          onClick={() => {
            setShowAddForm((v) => !v);
            setEditingId(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          {t("Add Account")}
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search accounts…")}
            className="pl-8 pr-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white w-64"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <svg aria-hidden="true" className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
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
          </div>
        )}

        {!isLoading && (
          <div className="divide-y divide-gray-200">
            {ACCOUNT_TYPE_ORDER.map((type) => {
              const items = grouped[type];
              const isCollapsed = collapsed[type];
              return (
                <div key={type}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(type)}
                    className="w-full flex items-center gap-2 px-5 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                    <div className={cn("w-2.5 h-2.5 rounded-full", ACCOUNT_TYPE_DOT[type])} />
                    <span className="text-sm font-semibold text-gray-700">
                      {t(ACCOUNT_TYPE_LABELS[type])}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">({items.length})</span>
                  </button>

                  {!isCollapsed && items.length === 0 && (
                    <div className="px-5 py-3 text-xs text-gray-400">{t("No accounts")}</div>
                  )}

                  {!isCollapsed &&
                    items.map((account) => (
                      <div key={account.id}>
                        {editingId === account.id ? (
                          <form
                            onSubmit={handleEditSubmit}
                            className="px-5 py-3 bg-blue-50 border-l-2 border-blue-500 space-y-3"
                          >
                            <div className="grid grid-cols-[80px_1fr_120px_120px] gap-3 items-end">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  {t("Code")}
                                </label>
                                <input
                                  type="text"
                                  value={editForm.code}
                                  onChange={(e) =>
                                    setEditForm((p) => ({ ...p, code: e.target.value }))
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  {t("Name")}
                                </label>
                                <input
                                  type="text"
                                  value={editForm.name}
                                  onChange={(e) =>
                                    setEditForm((p) => ({ ...p, name: e.target.value }))
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  {t("Sch C Line")}
                                </label>
                                <input
                                  type="text"
                                  value={editForm.schedule_c_line}
                                  onChange={(e) =>
                                    setEditForm((p) => ({ ...p, schedule_c_line: e.target.value }))
                                  }
                                  placeholder="e.g. 1"
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                                />
                              </div>
                              <div className="flex items-end gap-1.5">
                                <button
                                  type="submit"
                                  disabled={updateMutation.isPending}
                                  className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {updateMutation.isPending ? t("Saving…") : t("Save")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {editError && (
                              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                                {editError}
                              </div>
                            )}
                          </form>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 group transition-colors">
                            <span className="font-mono text-sm text-gray-500 w-16 shrink-0">
                              {account.code}
                            </span>
                            <span
                              className={cn(
                                "text-sm flex-1 truncate",
                                !account.active && "text-gray-400 line-through",
                              )}
                            >
                              {account.name}
                            </span>
                            <TypeBadge type={account.account_type} />
                            {account.schedule_c_line && (
                              <span className="text-xs text-gray-400 shrink-0">
                                Sch C: {account.schedule_c_line}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                toggleMutation.mutate({ id: account.id, active: !account.active })
                              }
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={account.active ? t("Deactivate") : t("Activate")}
                            >
                              {account.active ? (
                                <ToggleRight className="w-5 h-5 text-green-500 hover:text-green-600" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-gray-400 hover:text-gray-500" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(account)}
                              className="shrink-0 p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={t("Edit account")}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{t("Add Account")}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm(EMPTY_FORM);
                  setAddError(null);
                }}
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("Code")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.code}
                    onChange={(e) => setAddForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder="1000"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={createMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("Type")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.account_type}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, account_type: e.target.value as AccountType }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={createMutation.isPending}
                  >
                    {ACCOUNT_TYPE_ORDER.map((at) => (
                      <option key={at} value={at}>
                        {t(ACCOUNT_TYPE_LABELS[at])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Name")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Cash - Checking"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={createMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Parent Account")}{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={addForm.parent_id}
                  onChange={(e) => setAddForm((p) => ({ ...p, parent_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={createMutation.isPending}
                >
                  <option value="">None</option>
                  {accounts
                    .filter((a) => a.active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Schedule C Line")}{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={addForm.schedule_c_line}
                  onChange={(e) => setAddForm((p) => ({ ...p, schedule_c_line: e.target.value }))}
                  placeholder="e.g. 1"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={createMutation.isPending}
                />
              </div>

              {addError && (
                <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {addError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm(EMPTY_FORM);
                    setAddError(null);
                  }}
                  disabled={createMutation.isPending}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                    createMutation.isPending
                      ? "bg-blue-400 text-white cursor-wait"
                      : "bg-blue-600 text-white hover:bg-blue-700",
                  )}
                >
                  {createMutation.isPending ? t("Creating…") : t("Create Account")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
