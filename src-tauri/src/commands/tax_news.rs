/// Tax-news feed — fetches IRS RSS feeds, caches results in `tax_news_cache`,
/// and derives per-client relevance tags from the business profile.
use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use tauri::Manager;

use crate::{
    db::encryption::{app_db_key, sqlcipher_hex_key},
    error::{AppError, Result},
    state::AppState,
};

// ── Public shape ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub id: String,
    pub source: String,
    pub title: String,
    pub summary: Option<String>,
    pub published_at: Option<String>,
    pub url: String,
    pub categories: Vec<String>,
    /// Derived at read time from business profile; not stored in the DB.
    pub relevance_tags: Vec<String>,
}

// ── Feed sources ──────────────────────────────────────────────────────────────

struct FeedSource {
    label: &'static str,
    url: &'static str,
}

const FEED_SOURCES: &[FeedSource] = &[
    FeedSource {
        label: "IRS Newsroom",
        url: "https://www.irs.gov/newsroom/rss",
    },
    FeedSource {
        label: "IRS Tax Tips",
        url: "https://www.irs.gov/newsroom/irs-tax-tips",
    },
    FeedSource {
        label: "IRS News Releases",
        url: "https://www.irs.gov/newsroom/news-releases/rss.xml",
    },
    FeedSource {
        label: "IRS Business",
        url: "https://www.irs.gov/business/rss",
    },
];

// ── Relevance keyword → tag map ───────────────────────────────────────────────

fn build_keyword_map() -> HashMap<&'static str, &'static str> {
    let mut m = HashMap::new();
    m.insert("sole proprietor", "sole_prop");
    m.insert("sole prop", "sole_prop");
    m.insert("schedule c", "sole_prop");
    m.insert("self-employed", "sole_prop");
    m.insert("self employed", "sole_prop");
    m.insert("s corporation", "s_corp");
    m.insert("s-corp", "s_corp");
    m.insert("s corp", "s_corp");
    m.insert("c corporation", "c_corp");
    m.insert("c-corp", "c_corp");
    m.insert("c corp", "c_corp");
    m.insert("partnership", "partnership");
    m.insert("llc", "llc");
    m.insert("limited liability", "llc");
    m.insert("quarterly estimate", "quarterly_estimates");
    m.insert("estimated tax", "quarterly_estimates");
    m.insert("form 1040-es", "quarterly_estimates");
    m.insert("cash basis", "cash_accounting");
    m.insert("cash method", "cash_accounting");
    m.insert("accrual", "accrual_accounting");
    m.insert("small business", "small_business");
    m.insert("independent contractor", "contractor");
    m.insert("1099", "contractor");
    m.insert("w-2", "employee");
    m.insert("payroll", "payroll");
    m.insert("depreciation", "depreciation");
    m.insert("section 179", "depreciation");
    m.insert("home office", "home_office");
    m.insert("mileage", "vehicle");
    m.insert("vehicle", "vehicle");
    m
}

fn derive_relevance_tags(
    title: &str,
    summary: Option<&str>,
    entity_type: Option<&str>,
    accounting_method: Option<&str>,
) -> Vec<String> {
    let keyword_map = build_keyword_map();
    let haystack = format!(
        "{} {}",
        title.to_lowercase(),
        summary.unwrap_or("").to_lowercase()
    );

    let mut tags: Vec<String> = keyword_map
        .iter()
        .filter_map(|(kw, tag)| {
            if haystack.contains(kw) {
                Some((*tag).to_string())
            } else {
                None
            }
        })
        .collect();

    // Accounting method context boost
    if let Some(method) = accounting_method {
        let ml = method.to_lowercase();
        if ml == "cash"
            && haystack.contains("cash")
            && !tags.contains(&"cash_accounting".to_string())
        {
            tags.push("cash_accounting".to_string());
        } else if ml == "accrual"
            && haystack.contains("accrual")
            && !tags.contains(&"accrual_accounting".to_string())
        {
            tags.push("accrual_accounting".to_string());
        }
    }

    // Entity-type context boost (only add if keyword already matched something related)
    if let Some(et) = entity_type {
        let et_lower = et.to_lowercase();
        let (etag, keyword_hint): (&str, &str) = match et_lower.as_str() {
            "sole-prop" | "sole_prop" => ("sole_prop", "sole prop"),
            "smllc" => ("llc", "llc"),
            "scorp" => ("s_corp", "s corp"),
            "ccorp" => ("c_corp", "c corp"),
            "partnership" => ("partnership", "partnership"),
            _ => ("", ""),
        };
        if !etag.is_empty() && !tags.contains(&etag.to_string()) && haystack.contains(keyword_hint)
        {
            tags.push(etag.to_string());
        }
    }

    tags.sort();
    tags.dedup();
    tags
}

// ── Stable ID ─────────────────────────────────────────────────────────────────

fn stable_id(source: &str, url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    hasher.update(b"|");
    hasher.update(url.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

// ── HTTP fetch + parse ────────────────────────────────────────────────────────

struct RawItem {
    id: String,
    source: String,
    title: String,
    summary: Option<String>,
    published_at: Option<String>,
    url: String,
    categories: Vec<String>,
}

async fn fetch_feed(
    source_label: &str,
    feed_url: &str,
) -> std::result::Result<Vec<RawItem>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Taxeasy/1.0 (+https://taxeasy.app)")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(feed_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let feed = feed_rs::parser::parse(bytes.as_ref()).map_err(|e| e.to_string())?;

    let items = feed
        .entries
        .into_iter()
        .filter_map(|entry| {
            let title = entry.title.map(|t| t.content).unwrap_or_default();
            if title.is_empty() {
                return None;
            }

            let url = entry
                .links
                .first()
                .map(|l| l.href.clone())
                .unwrap_or_default();
            if url.is_empty() {
                return None;
            }

            let summary = entry
                .summary
                .map(|s| s.content)
                .or_else(|| entry.content.and_then(|c| c.body));

            let published_at = entry.published.or(entry.updated).map(|dt| dt.to_rfc3339());

            let categories: Vec<String> = entry.categories.iter().map(|c| c.term.clone()).collect();

            let id = stable_id(source_label, &url);

            Some(RawItem {
                id,
                source: source_label.to_string(),
                title,
                summary,
                published_at,
                url,
                categories,
            })
        })
        .collect();

    Ok(items)
}

async fn fetch_all_feeds() -> Vec<RawItem> {
    let mut all: Vec<RawItem> = Vec::new();
    for src in FEED_SOURCES {
        match fetch_feed(src.label, src.url).await {
            Ok(mut items) => {
                log::info!("tax_news: fetched {} items from {}", items.len(), src.label);
                all.append(&mut items);
            }
            Err(e) => {
                log::error!("tax_news: failed to fetch {} — {}", src.url, e);
            }
        }
    }
    log::info!(
        "tax_news: total items fetched from all sources: {}",
        all.len()
    );
    all
}

// ── Cache read/write ──────────────────────────────────────────────────────────

fn read_cache(conn: &rusqlite::Connection) -> rusqlite::Result<(Vec<RawItem>, Option<String>)> {
    let mut stmt = conn.prepare(
        "SELECT id, source, title, summary, published_at, url, categories, fetched_at
         FROM tax_news_cache
         ORDER BY published_at DESC
         LIMIT 100",
    )?;

    // Collect (RawItem, fetched_at) pairs, then separate.
    let pairs: Vec<(RawItem, String)> = stmt
        .query_map([], |row| {
            let fetched_at: String = row.get(7)?;
            Ok((
                RawItem {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    title: row.get(2)?,
                    summary: row.get(3)?,
                    published_at: row.get(4)?,
                    url: row.get(5)?,
                    categories: {
                        let cats: Option<String> = row.get(6)?;
                        cats.and_then(|s| serde_json::from_str(&s).ok())
                            .unwrap_or_default()
                    },
                },
                fetched_at,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Oldest fetched_at = string min (ISO-8601 lexicographic order is chronological).
    let oldest_fetched = pairs.iter().map(|(_, ts)| ts.clone()).min();
    let items = pairs.into_iter().map(|(item, _)| item).collect();

    Ok((items, oldest_fetched))
}

fn write_cache(conn: &rusqlite::Connection, items: &[RawItem]) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    for item in items {
        let cats_json = serde_json::to_string(&item.categories).unwrap_or_else(|_| "[]".into());
        conn.execute(
            "INSERT OR REPLACE INTO tax_news_cache
             (id, source, title, summary, published_at, url, categories, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                item.source,
                item.title,
                item.summary,
                item.published_at,
                item.url,
                cats_json,
                now,
            ],
        )?;
    }
    Ok(())
}

// ── Profile helpers ───────────────────────────────────────────────────────────

fn read_profile(conn: &rusqlite::Connection) -> (Option<String>, Option<String>) {
    conn.query_row(
        "SELECT entity_type, accounting_method FROM business_profile LIMIT 1",
        [],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    )
    .unwrap_or((None, None))
}

// ── Cache staleness ───────────────────────────────────────────────────────────

fn is_cache_stale(oldest_fetched: Option<&str>) -> bool {
    let Some(ts) = oldest_fetched else {
        return true;
    };
    let Ok(dt) = ts.parse::<DateTime<Utc>>() else {
        return true;
    };
    Utc::now() - dt > Duration::hours(24)
}

// ── Background refresh ────────────────────────────────────────────────────────

/// Opens a fresh connection to the app DB and writes the fetched items.
/// Called from `tokio::spawn` so it must not hold any Mutex guards.
async fn background_refresh(db_path: String, passphrase: String) {
    let items = fetch_all_feeds().await;
    if items.is_empty() {
        return;
    }

    let raw_key = match app_db_key(&passphrase) {
        Ok(k) => k,
        Err(_) => return,
    };
    let hex_key = sqlcipher_hex_key(&raw_key);

    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("tax_news background_refresh: cannot open db — {e}");
            return;
        }
    };
    if conn
        .execute_batch(&format!("PRAGMA key = \"{hex_key}\";"))
        .is_err()
    {
        return;
    }
    if let Err(e) = write_cache(&conn, &items) {
        log::warn!("tax_news background_refresh: write_cache failed — {e}");
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns cached news items (stale-while-revalidate after 6 h).
/// Pass `client_id` to get `relevance_tags` derived from the business profile.
#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_tax_news(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<NewsItem>> {
    // ── 1. Grab cached items and passphrase while holding the Mutex ──────────
    let cached_items: Vec<RawItem>;
    let oldest_fetched: Option<String>;
    let db_path: String;
    let passphrase: String;
    {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;

        let (items, oldest) = read_cache(db.conn()).map_err(AppError::Database)?;
        cached_items = items;
        oldest_fetched = oldest;

        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e: tauri::Error| {
                AppError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;
        db_path = data_dir.join("app.db").to_string_lossy().into_owned();

        passphrase = state.passphrase.lock().unwrap().clone().unwrap_or_default();
    }

    // ── 2. Stale-while-revalidate ────────────────────────────────────────────
    if is_cache_stale(oldest_fetched.as_deref()) && !db_path.is_empty() {
        let path = db_path.clone();
        let pass = passphrase.clone();
        tokio::spawn(async move {
            background_refresh(path, pass).await;
        });
    }

    // ── 3. If cache is empty, do a synchronous first-fill ───────────────────
    let raw_items = if cached_items.is_empty() {
        let fetched = fetch_all_feeds().await;
        if !fetched.is_empty() {
            let lock = state.app_db.lock().unwrap();
            if let Some(db) = lock.as_ref() {
                let _ = write_cache(db.conn(), &fetched);
            }
        }
        fetched
    } else {
        cached_items
    };

    // ── 4. Derive relevance tags if a client is in context ───────────────────
    let (entity_type, accounting_method) = if client_id.is_some() {
        let lock = state.app_db.lock().unwrap();
        match lock.as_ref() {
            Some(db) => read_profile(db.conn()),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    let news: Vec<NewsItem> = raw_items
        .into_iter()
        .map(|item| {
            let relevance_tags = if client_id.is_some() {
                derive_relevance_tags(
                    &item.title,
                    item.summary.as_deref(),
                    entity_type.as_deref(),
                    accounting_method.as_deref(),
                )
            } else {
                vec![]
            };
            NewsItem {
                id: item.id,
                source: item.source,
                title: item.title,
                summary: item.summary,
                published_at: item.published_at,
                url: item.url,
                categories: item.categories,
                relevance_tags,
            }
        })
        .collect();

    Ok(news)
}

/// Force-refresh: bypasses the 6-hour cache gate and fetches immediately.
#[tauri::command(rename_all = "camelCase")]
pub async fn refresh_tax_news(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<NewsItem>> {
    let fetched = fetch_all_feeds().await;

    if !fetched.is_empty() {
        let lock = state.app_db.lock().unwrap();
        if let Some(db) = lock.as_ref() {
            let _ = write_cache(db.conn(), &fetched);
        }
    }

    // Return through the normal read path so relevance tags are applied.
    fetch_tax_news(client_id, app_handle, state).await
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_id_is_deterministic() {
        let a = stable_id("IRS Newsroom", "https://example.com/1");
        let b = stable_id("IRS Newsroom", "https://example.com/1");
        assert_eq!(a, b);
    }

    #[test]
    fn stable_id_differs_for_different_sources() {
        let a = stable_id("IRS Newsroom", "https://example.com/1");
        let b = stable_id("IRS Newsroom", "https://example.com/2");
        assert_ne!(a, b);
    }

    #[test]
    fn relevance_tags_sole_prop_quarterly() {
        let tags = derive_relevance_tags(
            "Quarterly estimated tax tips for sole proprietors",
            Some("Use schedule C to report income"),
            Some("sole-prop"),
            Some("cash"),
        );
        assert!(
            tags.contains(&"sole_prop".to_string()),
            "expected sole_prop in {tags:?}"
        );
        assert!(
            tags.contains(&"quarterly_estimates".to_string()),
            "expected quarterly_estimates in {tags:?}"
        );
    }

    #[test]
    fn relevance_tags_empty_when_no_match() {
        let tags = derive_relevance_tags(
            "IRS announces new holiday office schedule",
            None,
            Some("sole-prop"),
            Some("cash"),
        );
        assert!(!tags.contains(&"quarterly_estimates".to_string()));
    }

    #[test]
    fn relevance_tags_s_corp() {
        let tags = derive_relevance_tags(
            "New rules for S corporation reasonable compensation",
            None,
            Some("scorp"),
            None,
        );
        assert!(
            tags.contains(&"s_corp".to_string()),
            "expected s_corp in {tags:?}"
        );
    }

    #[test]
    fn cache_stale_when_none() {
        assert!(is_cache_stale(None));
    }

    #[test]
    fn cache_stale_when_old() {
        let old = (Utc::now() - Duration::hours(7)).to_rfc3339();
        assert!(is_cache_stale(Some(&old)));
    }

    #[test]
    fn cache_fresh_when_recent() {
        let recent = (Utc::now() - Duration::hours(1)).to_rfc3339();
        assert!(!is_cache_stale(Some(&recent)));
    }

    #[test]
    fn parse_fixture_rss() {
        let xml = include_str!("../../tests/fixtures/irs_newsroom.xml");
        let feed =
            feed_rs::parser::parse(xml.as_bytes()).expect("fixture RSS should parse without error");
        assert!(
            !feed.entries.is_empty(),
            "fixture should contain at least one entry"
        );
        let first = &feed.entries[0];
        assert!(first.title.is_some(), "first entry must have a title");
    }
}
