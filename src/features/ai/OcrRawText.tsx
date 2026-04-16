import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../lib/i18n";

export function OcrRawText({ rawText }: { rawText: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!rawText) return;
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide">
          {t("ai.ocrRawText")}
        </h4>
        {rawText && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-300 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {rawText ? (
          <pre className="p-3 rounded-lg bg-neutral-800 text-neutral-200 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono overflow-auto max-h-80">
            {rawText}
          </pre>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-gray-400 dark:text-neutral-500">{t("ai.ocrRawText")} — —</p>
          </div>
        )}
      </div>
    </div>
  );
}
