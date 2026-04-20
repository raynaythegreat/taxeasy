import { invoke } from "@tauri-apps/api/core";

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  summary?: string;
  published_at?: string;
  url: string;
  categories: string[];
  relevance_tags: string[];
}

export async function fetchTaxNews(clientId?: string): Promise<NewsItem[]> {
  console.log("[TaxNews] Fetching tax news for client:", clientId ?? "global");
  try {
    const result = await invoke<NewsItem[]>("fetch_tax_news", {
      clientId: clientId ?? null,
    });
    console.log("[TaxNews] Fetched", result.length, "items");
    if (result.length === 0) {
      console.warn(
        "[TaxNews] No items returned - check network connectivity and IRS feed availability",
      );
    } else {
      console.log("[TaxNews] First item:", result[0]);
    }
    return result;
  } catch (error) {
    console.error("[TaxNews] Fetch failed:", error);
    throw error;
  }
}

export async function refreshTaxNews(clientId?: string): Promise<NewsItem[]> {
  return invoke<NewsItem[]>("refresh_tax_news", {
    clientId: clientId ?? null,
  });
}
