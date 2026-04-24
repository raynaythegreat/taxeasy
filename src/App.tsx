import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
import { SettingsProvider } from "./contexts/SettingsContext";
import { UnlockScreen } from "./features/unlock/UnlockScreen";
import { isUnlocked } from "./lib/tauri";
import { useKeyboardShortcuts } from "./lib/use-keyboard-shortcuts";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleToggleShortcuts = useCallback(() => {
    setShortcutsOpen((o) => !o);
  }, []);

  useKeyboardShortcuts({
    "?": handleToggleShortcuts,
    "mod+/": handleToggleShortcuts,
    escape: () => setShortcutsOpen(false),
  });

  useEffect(() => {
    isUnlocked()
      .then(setUnlocked)
      .catch(() => setUnlocked(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!unlocked) {
    return <UnlockScreen onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AppShell />
        <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </SettingsProvider>
    </ErrorBoundary>
  );
}
