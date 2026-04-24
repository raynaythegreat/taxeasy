import { useState } from "react";
import { useI18n } from "../../../lib/i18n";
import { getSettings, type SaveSettingsPayload, verifyPin } from "../../../lib/settings-api";

interface SecurityTabProps {
  saving: boolean;
  onSave: (partial: SaveSettingsPayload) => void;
}

export function SecurityTab({ saving, onSave }: SecurityTabProps) {
  const { t } = useI18n();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const digitOnly = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const handleSubmit = async () => {
    setError("");

    if (newPin.length !== 4) {
      setError(t("New PIN must be exactly 4 digits"));
      return;
    }
    if (newPin !== confirmPin) {
      setError(t("PINs do not match"));
      return;
    }

    setVerifying(true);
    try {
      const settings = await getSettings();
      const stored = settings.app_pin || "0000";

      if (stored !== "0000") {
        if (currentPin.length !== 4) {
          setError(t("Enter your current PIN"));
          return;
        }
        const valid = await verifyPin(currentPin);
        if (!valid) {
          setError(t("Current PIN is incorrect"));
          return;
        }
      }

      onSave({ app_pin: newPin });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setError(t("Failed to verify PIN"));
    } finally {
      setVerifying(false);
    }
  };

  const isPending = saving || verifying;
  const canSubmit = newPin.length === 4 && confirmPin.length === 4 && !isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t("Change PIN")}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t("Change your 4-digit PIN for unlocking the app.")}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="sec-current-pin" className="w-28 text-sm text-gray-600 shrink-0">
              {t("Current PIN")}
            </label>
            <input
              id="sec-current-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(digitOnly(e.target.value))}
              placeholder="••••"
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="sec-new-pin" className="w-28 text-sm text-gray-600 shrink-0">
              {t("New PIN")}
            </label>
            <input
              id="sec-new-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(digitOnly(e.target.value))}
              placeholder="••••"
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="sec-confirm-pin" className="w-28 text-sm text-gray-600 shrink-0">
              {t("Confirm PIN")}
            </label>
            <input
              id="sec-confirm-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(digitOnly(e.target.value))}
              placeholder="••••"
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? t("Saving…") : t("Update PIN")}
          </button>
        </div>
      </div>
    </div>
  );
}
