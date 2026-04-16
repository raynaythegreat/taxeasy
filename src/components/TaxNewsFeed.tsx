import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Rss, WifiOff } from "lucide-react";
import { fetchTaxNews, type NewsItem } from "../lib/tax-news-api";

// ── Highlighted tags that surface a "Why this matters" line ──────────────────
const HIGHLIGHTED_TAGS = new Set([
  "sole_prop",
  "quarterly_estimates",
  "s_corp",
  "c_corp",
  "partnership",
  "llc",
  "cash_accounting",
  "accrual_accounting",
  "home_office",
  "vehicle",
  "depreciation",
  "contractor",
  "payroll",
]);

const TAG_LABELS: Record<string, string> = {
  sole_prop: "sole proprietors",
  quarterly_estimates: "quarterly estimated taxes",
  s_corp: "S corporations",
  c_corp: "C corporations",
  partnership: "partnerships",
  llc: "LLCs",
  cash_accounting: "cash-basis filers",
  accrual_accounting: "accrual-basis filers",
  home_office: "home office deductions",
  vehicle: "vehicle expenses",
  depreciation: "depreciation & Section 179",
  contractor: "independent contractors",
  payroll: "payroll",
  small_business: "small businesses",
};

// ── Relative date helper ──────────────────────────────────────────────────────

function relativeDate(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
      <Rss className="w-3 h-3" />
      {source}
    </span>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function NewsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 p-3 rounded-lg border border-gray-100">
          <div className="h-3 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

// ── Single news row ───────────────────────────────────────────────────────────

function NewsRow({ item }: { item: NewsItem }) {
  const matchedTags = item.relevance_tags.filter((t) => HIGHLIGHTED_TAGS.has(t));
  const whyLine =
    matchedTags.length > 0
      ? `Relevant for: ${matchedTags.map((t) => TAG_LABELS[t] ?? t).join(", ")}`
      : null;

  return (
    <div className="flex flex-col gap-1 py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <SourceBadge source={item.source} />
        {item.published_at && (
          <span className="text-xs text-gray-400">{relativeDate(item.published_at)}</span>
        )}
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-gray-900 hover:text-blue-600 leading-snug flex items-start gap-1 group"
      >
        <span className="flex-1">{item.title}</span>
        <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      </a>
      {item.summary && <p className="text-xs text-gray-500 line-clamp-1">{item.summary}</p>}
      {whyLine && <p className="text-xs text-blue-600 font-medium">{whyLine}</p>}
    </div>
  );
}

// ── Stale / offline pill ──────────────────────────────────────────────────────

function OfflinePill({ since }: { since?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
      <WifiOff className="w-3 h-3" />
      {since ? `Offline — last updated ${relativeDate(since)}` : "Offline"}
    </span>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface TaxNewsFeedProps {
  clientId?: string;
  maxItems?: number;
  onViewAll?: () => void;
}

export function TaxNewsFeed({ clientId, maxItems = 3, onViewAll }: TaxNewsFeedProps) {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<NewsItem[]>({
    queryKey: ["tax_news", clientId ?? "global"],
    queryFn: () => fetchTaxNews(clientId),
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — matches backend cache window
    retry: 1,
  });

  const items = (data ?? []).slice(0, maxItems);
  const isStale =
    !isLoading && dataUpdatedAt > 0 && Date.now() - dataUpdatedAt > 6 * 60 * 60 * 1000;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Tax Law News</h3>
          {(isError || isStale) && (
            <OfflinePill
              since={isStale && dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined}
            />
          )}
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            View all
          </button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <NewsSkeleton />
      ) : isError && items.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Unable to load news. Check your connection.
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No news items yet.</p>
      ) : (
        <div>
          {items.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* TODO(D6): AI summarization hook
          If settings.summarize_tax_news_with_ai is true, post-process each
          item.summary through the Ollama/LM Studio integration from ai-api.ts.
          Gate: const aiEnabled = await getSettings().then(s => s.summarize_tax_news_with_ai === "true")
          Default off — do not call AI unless explicitly enabled. */}
    </div>
  );
}

// Re-export type for consumers
export type { NewsItem };
