import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
import { SettingsProvider } from "./contexts/SettingsContext";
import { UnlockScreen } from "./features/unlock/UnlockScreen";
import { isUnlocked } from "./lib/tauri";
import { useKeyboardShortcuts } from "./lib/use-keyboard-shortcuts";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
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
    isUnlocked().then(setUnlocked);
  }, []);

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
