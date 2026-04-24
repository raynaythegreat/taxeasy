import { Globe, LayoutDashboard, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ClientsPage } from "../features/clients/ClientsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useI18n } from "../lib/i18n";
import { getActiveClientPref, switchClient } from "../lib/tauri";
import { useKeyboardShortcuts } from "../lib/use-keyboard-shortcuts";
import { cn } from "../lib/utils";
import type { WorkspaceTab } from "./ClientWorkspace";
import { DashboardWorkspace } from "./DashboardWorkspace";
import { TaxNewsPage } from "./TaxNewsPage";

type AppView = "dashboard" | "clients" | "settings" | "tax-news";

export function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const [view, setView] = useState<AppView>("dashboard");
  const [initialClientId, setInitialClientId] = useState<string | null>(null);
  const [initialClientTab] = useState<WorkspaceTab>("overview");
  const [autoShowForm, setAutoShowForm] = useState(false);

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
    "mod+n": () => {
      setAutoShowForm(true);
      setView("clients");
    },
  });

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
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
              "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
            aria-label={locale === "en" ? "Switch to Spanish" : "Switch to English"}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{locale === "en" ? "EN" : "ES"}</span>
          </button>
        </div>
      </header>

      <main id="main" className="flex-1 min-h-0 overflow-hidden">
        {view === "dashboard" && (
          <DashboardWorkspace
            onNewClient={() => {
              setAutoShowForm(true);
              setView("clients");
            }}
          />
        )}
        {view === "clients" && (
          <ClientsPage
            key={`clients-${autoShowForm ? 'form' : 'list'}`}
            initialClientId={initialClientId}
            initialTab={initialClientTab}
            onBack={() => {
              setAutoShowForm(false);
              setView("dashboard");
            }}
            autoShowForm={autoShowForm}
          />
        )}
        {view === "settings" && <SettingsPage onBack={() => setView("dashboard")} />}
        {view === "tax-news" && <TaxNewsPage />}
      </main>
    </div>
  );
}
