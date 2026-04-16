import { LayoutDashboard, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ClientsPage } from "../features/clients/ClientsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useI18n } from "../lib/i18n";
import { getActiveClientPref, switchClient } from "../lib/tauri";
import { useKeyboardShortcuts } from "../lib/use-keyboard-shortcuts";
import { cn } from "../lib/utils";
import type { WorkspaceTab } from "./ClientWorkspace";
import { DashboardPage } from "./DashboardPage";
import { TaxNewsPage } from "./TaxNewsPage";

type AppView = "dashboard" | "clients" | "settings" | "tax-news";

export function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const [view, setView] = useState<AppView>("dashboard");
  const [initialClientId, setInitialClientId] = useState<string | null>(null);
  const [initialClientTab, setInitialClientTab] = useState<WorkspaceTab>("overview");

  useEffect(() => {
    getActiveClientPref()
      .then((id) => {
        if (id) {
          switchClient(id).catch(() => {});
          setInitialClientId(id);
        }
      })
      .catch(() => {});
  }, []);

  useKeyboardShortcuts({
    "mod+,": () => setView("settings"),
  });

  const handleSelectClient = (clientId: string) => {
    setInitialClientId(clientId);
    setInitialClientTab("overview");
    setView("clients");
  };

  const handleNavigate = (page: string) => {
    switch (page) {
      case "dashboard":
        setView("dashboard");
        return;
      case "settings":
        setView("settings");
        return;
      case "tax-news":
        setView("tax-news");
        return;
      case "transactions":
      case "ledger":
        setInitialClientTab("transactions");
        setView("clients");
        return;
      case "invoices":
        setInitialClientTab("invoices");
        setView("clients");
        return;
      case "documents":
        setInitialClientTab("documents");
        setView("clients");
        return;
      case "reports":
        setInitialClientTab("reports");
        setView("clients");
        return;
      case "ai":
        setInitialClientTab("ai");
        setView("clients");
        return;
      default:
        setInitialClientTab("overview");
        setView("clients");
    }
  };

  const NAV_ITEMS: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: t("Dashboard"), icon: LayoutDashboard },
    { id: "clients", label: t("Clients"), icon: Users },
    { id: "settings", label: t("Settings"), icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-[var(--color-background)]">
      {/* Skip link — visible on focus for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only fixed top-2 left-2 bg-[var(--primary)] text-white px-3 py-2 rounded"
        style={{ zIndex: "var(--z-toast)" }}
      >
        Skip to main content
      </a>

      <header className="shrink-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2 flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setView("dashboard")}
          className="text-lg font-bold text-[var(--color-text)] hover:text-blue-600 transition-colors mr-6"
        >
          Taxeasy
        </button>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  view === item.id
                    ? "bg-blue-600 text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "es" : "en")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]",
            )}
          >
            <span>{locale === "en" ? "🇺🇸 EN" : "🇪🇸 ES"}</span>
          </button>
        </div>
      </header>

      <main id="main" className="flex-1 min-h-0 overflow-hidden">
        {view === "dashboard" && (
          <DashboardPage
            onSelectClient={handleSelectClient}
            onNewClient={() => handleNavigate("clients")}
            onNavigate={handleNavigate}
          />
        )}
        {view === "clients" && (
          <ClientsPage
            initialClientId={initialClientId}
            initialTab={initialClientTab}
            onBack={() => setView("dashboard")}
          />
        )}
        {view === "settings" && <SettingsPage onBack={() => setView("dashboard")} />}
        {view === "tax-news" && <TaxNewsPage />}
      </main>
    </div>
  );
}
