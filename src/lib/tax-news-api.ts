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
  return invoke<NewsItem[]>("fetch_tax_news", {
    clientId: clientId ?? null,
  });
}

export async function refreshTaxNews(clientId?: string): Promise<NewsItem[]> {
  return invoke<NewsItem[]>("refresh_tax_news", {
    clientId: clientId ?? null,
  });
}
