import { useState, useCallback } from "react";
import { UnlockScreen } from "./features/unlock/UnlockScreen";
import { AppShell } from "./components/AppShell";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
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

  if (!unlocked) {
    return <UnlockScreen onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <>
      <AppShell />
      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
