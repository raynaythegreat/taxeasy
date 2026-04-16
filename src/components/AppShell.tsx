import { LayoutDashboard, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ClientsPage } from "../features/clients/ClientsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useI18n } from "../lib/i18n";
import { getActiveClientPref, switchClient } from "../lib/tauri";
import { useKeyboardShortcuts } from "../lib/use-keyboard-shortcuts";
import { cn } from "../lib/utils";
import { DashboardPage } from "./DashboardPage";

type AppView = "dashboard" | "clients" | "settings";

export function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const [view, setView] = useState<AppView>("dashboard");
  const [initialClientId, setInitialClientId] = useState<string | null>(null);

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
    setView("clients");
  };

  const NAV_ITEMS: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: t("Dashboard"), icon: LayoutDashboard },
    { id: "clients", label: t("Clients"), icon: Users },
    { id: "settings", label: t("Settings"), icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-[var(--color-background)]">
      <header className="shrink-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2 flex items-center gap-2 print:hidden">
        <button
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
      <main className="flex-1 min-h-0 overflow-hidden">
        {view === "dashboard" && (
          <DashboardPage
            onSelectClient={handleSelectClient}
            onNewClient={() => setView("clients")}
            onNavigate={(page) => setView(page as AppView)}
          />
        )}
        {view === "clients" && (
          <ClientsPage initialClientId={initialClientId} onBack={() => setView("dashboard")} />
        )}
        {view === "settings" && <SettingsPage onBack={() => setView("dashboard")} />}
      </main>
    </div>
  );
}
