import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Rss, Search, WifiOff, X } from "lucide-react";
import { useMemo, useState } from "react";
import { fetchTaxNews, type NewsItem, refreshTaxNews } from "../lib/tax-news-api";
import { cn } from "../lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const isNewsroom = source.toLowerCase().includes("newsroom");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
        isNewsroom ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700",
      )}
    >
      <Rss className="w-3 h-3" />
      {source}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex gap-2">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-5 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-100 rounded w-4/6" />
        </div>
      ))}
    </div>
  );
}

// ── News card ─────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <SourceBadge source={item.source} />
        {item.published_at && (
          <span className="text-xs text-gray-400">{relativeDate(item.published_at)}</span>
        )}
        {item.categories.slice(0, 2).map((cat) => (
          <span key={cat} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
            {cat}
          </span>
        ))}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold text-gray-900 hover:text-blue-600 leading-snug flex items-start gap-1 group mb-1"
      >
        <span className="flex-1">{item.title}</span>
        <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      </a>

      {item.summary && <p className="text-xs text-gray-500 line-clamp-2">{item.summary}</p>}

      {item.relevance_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.relevance_tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium"
            >
              {tag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface TaxNewsPageProps {
  clientId?: string;
}

export function TaxNewsPage({ clientId }: TaxNewsPageProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryKey = ["tax_news", clientId ?? "global"];

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<NewsItem[]>({
    queryKey,
    queryFn: () => fetchTaxNews(clientId),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const items = data ?? [];

  // Collect unique sources and categories for filter dropdowns
  const sources = useMemo(() => Array.from(new Set(items.map((i) => i.source))).sort(), [items]);
  const categories = useMemo(
    () =>
      Array.from(new Set(items.flatMap((i) => i.categories)))
        .filter(Boolean)
        .sort(),
    [items],
  );

  // Client-side filter + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (categoryFilter !== "all" && !item.categories.includes(categoryFilter)) return false;
      if (q) {
        const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, sourceFilter, categoryFilter]);

  const isStale =
    !isLoading && dataUpdatedAt > 0 && Date.now() - dataUpdatedAt > 6 * 60 * 60 * 1000;

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const fresh = await refreshTaxNews(clientId);
      queryClient.setQueryData(queryKey, fresh);
    } catch {
      // best-effort — stale data still shows
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tax Law News</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Latest from the IRS — updated every 6 hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isError || isStale) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
              <WifiOff className="w-3 h-3" />
              {isStale
                ? `Last updated ${relativeDate(new Date(dataUpdatedAt).toISOString())}`
                : "Offline"}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border",
              "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search news…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All sources</option>
          {sources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Result count */}
      {!isLoading && items.length > 0 && (
        <p className="text-xs text-gray-400">
          {filtered.length} of {items.length} articles
          {(search || sourceFilter !== "all" || categoryFilter !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setSourceFilter("all");
                setCategoryFilter("all");
              }}
              className="ml-2 text-blue-500 hover:text-blue-700 underline"
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <PageSkeleton />
      ) : isError && items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <WifiOff className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            Unable to load news. Check your connection and try refreshing.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No articles match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
