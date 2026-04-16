import { ArrowRight } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { TaxNewsFeed } from "../TaxNewsFeed";

interface TaxNewsSectionProps {
  clientId?: string;
  onViewAll: () => void;
}

export function TaxNewsSection({ clientId, onViewAll }: TaxNewsSectionProps) {
  const { t } = useI18n();

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {t("Tax Law News")}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {t("View All")}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="p-4">
        <TaxNewsFeed clientId={clientId} maxItems={3} onViewAll={onViewAll} />
      </div>
    </div>
  );
}
