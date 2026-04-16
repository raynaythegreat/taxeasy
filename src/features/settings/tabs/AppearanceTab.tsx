import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import type { SaveSettingsPayload } from "../../../lib/settings-api";

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

interface AppearanceTabProps {
  theme: "light" | "dark" | "system";
  saving: boolean;
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  onSave: (partial: SaveSettingsPayload) => void;
}

export function AppearanceTab({ theme, saving, onThemeChange, onSave }: AppearanceTabProps) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900">{t("Theme")}</h3>

      <div className="grid grid-cols-3 gap-3">
        {(["light", "dark", "system"] as const).map((th) => (
          <button
            key={th}
            onClick={() => onThemeChange(th)}
            className={cn(
              "rounded-xl border-2 p-4 text-center transition-colors focus:outline-none",
              theme === th
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg mx-auto mb-2 border",
                th === "light" && "bg-white border-gray-300",
                th === "dark" && "bg-gray-900 border-gray-700",
                th === "system" && "bg-gradient-to-br from-white to-gray-900 border-gray-400"
              )}
            />
            <span
              className={cn(
                "text-sm font-medium",
                theme === th ? "text-blue-700" : "text-gray-700"
              )}
            >
              {t(th === "light" ? "Light" : th === "dark" ? "Dark" : "System")}
            </span>
          </button>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onSave({ theme })}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Spinner />}
          {t("Save Appearance")}
        </button>
      </div>
    </div>
  );
}
