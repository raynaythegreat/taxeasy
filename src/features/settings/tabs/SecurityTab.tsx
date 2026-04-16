import { useState } from "react";
import { useI18n } from "../../../lib/i18n";
import type { SaveSettingsPayload } from "../../../lib/settings-api";

interface SecurityTabProps {
  saving: boolean;
  onSave: (partial: SaveSettingsPayload) => void;
}

export function SecurityTab({ saving, onSave }: SecurityTabProps) {
  const { t } = useI18n();
  const [pinChange, setPinChange] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t("Change PIN")}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t("Change your 4-digit PIN for unlocking the app.")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pinChange}
            onChange={(e) => setPinChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={t("New PIN")}
            className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => {
              if (pinChange.length === 4) {
                onSave({ app_pin: pinChange });
                setPinChange("");
              }
            }}
            disabled={pinChange.length !== 4 || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("Update PIN")}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("Current PIN")}</h3>
        <p className="text-sm text-gray-500">
          {t("Your app is currently protected with a 4-digit PIN. Default PIN is")} <span className="font-mono">0000</span>
        </p>
      </div>
    </div>
  );
}
