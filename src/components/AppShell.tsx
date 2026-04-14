import { useEffect, useState } from "react";
import { ClientsPage } from "../features/clients/ClientsPage";
import { DashboardPage } from "./DashboardPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { getActiveClientPref, switchClient } from "../lib/tauri";
import { useKeyboardShortcuts } from "../lib/use-keyboard-shortcuts";
import { Settings, LayoutDashboard, Users } from "lucide-react";
import { cn } from "../lib/utils";

type AppView = "dashboard" | "clients" | "settings";

export function AppShell() {
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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "clients", label: "Clients", icon: Users },
    { id: "settings", label: "Settings", icon: Settings },
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
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
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
          <ClientsPage
            initialClientId={initialClientId}
            onBack={() => setView("dashboard")}
          />
        )}
        {view === "settings" && <SettingsPage onBack={() => setView("dashboard")} />}
      </main>
    </div>
  );
}
