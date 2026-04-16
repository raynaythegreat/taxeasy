import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { type PeriodRange, type PeriodTypeInput, reportPeriodFor } from "../lib/tauri";

type BuiltinPeriod =
  | "this_month"
  | "last_month"
  | "quarter"
  | "ytd"
  | "tax_year"
  | "last_tax_year"
  | "custom";

interface PeriodPickerProps {
  clientId: string;
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function PeriodPicker({ clientId, value: _value, onChange }: PeriodPickerProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<BuiltinPeriod>("ytd");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(false);

  const LABELS: Record<BuiltinPeriod, string> = {
    this_month: t("This Month"),
    last_month: t("Last Month"),
    quarter: t("This Quarter"),
    ytd: t("YTD"),
    tax_year: t("Tax Year"),
    last_tax_year: t("Last Tax Year"),
    custom: t("Custom"),
  };

  async function pick(period: BuiltinPeriod) {
    setSelected(period);
    if (period === "custom") return;
    setLoading(true);
    try {
      const input: PeriodTypeInput = period === "quarter" ? { type: "quarter" } : { type: period };
      const range = await reportPeriodFor(clientId, input, today());
      onChange(range);
    } finally {
      setLoading(false);
    }
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    onChange({ start: customStart, end: customEnd });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <fieldset className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden m-0 p-0">
        <legend className="sr-only">{t("Select period")}</legend>
        {(Object.keys(LABELS) as BuiltinPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            disabled={loading}
            onClick={() => pick(p)}
            className={[
              "px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-200 last:border-r-0",
              selected === p ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50",
              loading ? "opacity-50 cursor-not-allowed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {LABELS[p]}
          </button>
        ))}
      </fieldset>

      {selected === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"
            aria-label={t("Start date")}
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"
            aria-label={t("End date")}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customStart || !customEnd}
            className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("Apply")}
          </button>
        </div>
      )}
    </div>
  );
}
