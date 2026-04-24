use std::collections::HashSet;

use feed_rs::model::Feed;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

const IRS_FEEDS: &[(&str, &str)] = &[
    ("IRS Newsroom", "https://www.irs.gov/newsroom/rss"),
    (
        "IRS News Releases",
        "https://www.irs.gov/newsroom/news-releases/rss.xml",
    ),
    ("IRS Business", "https://www.irs.gov/business/rss"),
];

#[derive(Debug, Clone)]
pub struct TaxLookupConfig {
    pub govinfo_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxSourceItem {
    pub source: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub url: String,
    pub published_at: Option<String>,
    pub confidence: String,
    pub score: i32,
}

#[derive(Debug, Deserialize)]
struct FederalRegisterResponse {
    results: Vec<FederalRegisterItem>,
}

#[derive(Debug, Deserialize)]
struct FederalRegisterItem {
    title: String,
    #[serde(rename = "abstract")]
    abstract_text: Option<String>,
    html_url: Option<String>,
    pdf_url: Option<String>,
    publication_date: Option<String>,
    agencies: Option<Vec<FederalRegisterAgency>>,
    #[serde(rename = "type")]
    document_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FederalRegisterAgency {
    name: String,
}

#[derive(Debug, Deserialize)]
struct GovInfoResponse {
    results: Vec<GovInfoItem>,
}

#[derive(Debug, Deserialize)]
struct GovInfoItem {
    title: String,
    #[serde(rename = "dateIssued")]
    date_issued: Option<String>,
    #[serde(rename = "collectionCode")]
    collection_code: Option<String>,
    #[serde(rename = "governmentAuthor")]
    government_author: Option<Vec<String>>,
    download: Option<GovInfoDownload>,
    #[serde(rename = "resultLink")]
    result_link: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GovInfoDownload {
    #[serde(rename = "pdfLink")]
    pdf_link: Option<String>,
    #[serde(rename = "txtLink")]
    txt_link: Option<String>,
}

pub fn lookup_tax_guidance(
    query: &str,
    config: &TaxLookupConfig,
    max_results: usize,
) -> Result<Vec<TaxSourceItem>> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Taxeasy/1.0 (+https://taxeasy.app)")
        .build()
        .map_err(|e| AppError::AiService(format!("Failed to build tax research client: {e}")))?;

    let mut sources = Vec::new();
    if let Ok(mut irs_sources) = search_irs_news(&client, query) {
        sources.append(&mut irs_sources);
    }
    if let Ok(mut federal_register_sources) = search_federal_register(&client, query) {
        sources.append(&mut federal_register_sources);
    }

    if let Some(api_key) = config
        .govinfo_api_key
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        if let Ok(mut govinfo_sources) = search_govinfo(&client, query, api_key) {
            sources.append(&mut govinfo_sources);
        }
    }

    let mut seen = HashSet::new();
    sources.retain(|item| seen.insert(item.url.clone()));
    sources.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| b.published_at.cmp(&a.published_at))
            .then_with(|| a.title.cmp(&b.title))
    });
    sources.truncate(max_results);

    Ok(sources)
}

fn tokenize(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|token| token.len() > 2)
        .map(|token| token.to_owned())
        .collect()
}

fn score_match(query: &str, title: &str, summary: &str, official_boost: i32) -> i32 {
    let tokens = tokenize(query);
    if tokens.is_empty() {
        return official_boost;
    }

    let title_lower = title.to_lowercase();
    let summary_lower = summary.to_lowercase();
    let mut score = official_boost;

    for token in tokens {
        if title_lower.contains(&token) {
            score += 4;
        }
        if summary_lower.contains(&token) {
            score += 2;
        }
    }

    score
}

fn is_tax_related(title: &str, summary: &str) -> bool {
    let haystack = format!("{} {}", title.to_lowercase(), summary.to_lowercase());
    [
        "tax",
        "irs",
        "treasury",
        "income",
        "deduction",
        "estimated",
        "withholding",
        "schedule c",
        "payroll",
        "1099",
        "w-2",
        "business",
        "filing",
        "refund",
    ]
    .iter()
    .any(|keyword| haystack.contains(keyword))
}

fn confidence_for_score(score: i32) -> String {
    if score >= 14 {
        "high".to_owned()
    } else if score >= 8 {
        "medium".to_owned()
    } else {
        "low".to_owned()
    }
}

fn search_irs_news(client: &Client, query: &str) -> Result<Vec<TaxSourceItem>> {
    let mut items = Vec::new();

    for (label, url) in IRS_FEEDS {
        let response = client
            .get(*url)
            .send()
            .map_err(|e| AppError::AiService(format!("Failed to fetch IRS feed {label}: {e}")))?;

        let bytes = response
            .bytes()
            .map_err(|e| AppError::AiService(format!("Failed to read IRS feed {label}: {e}")))?;

        let feed = feed_rs::parser::parse(bytes.as_ref())
            .map_err(|e| AppError::AiService(format!("Failed to parse IRS feed {label}: {e}")))?;

        items.extend(extract_irs_items(feed, label, query));
    }

    Ok(items)
}

fn extract_irs_items(feed: Feed, label: &str, query: &str) -> Vec<TaxSourceItem> {
    feed.entries
        .into_iter()
        .filter_map(|entry| {
            let title = entry.title.map(|t| t.content).unwrap_or_default();
            let summary = entry
                .summary
                .map(|s| s.content)
                .or_else(|| entry.content.and_then(|c| c.body))
                .unwrap_or_default();

            if title.is_empty() || !is_tax_related(&title, &summary) {
                return None;
            }

            let url = entry.links.first().map(|link| link.href.clone())?;
            let score = score_match(query, &title, &summary, 10);

            if score < 8 {
                return None;
            }

            Some(TaxSourceItem {
                source: label.to_owned(),
                kind: "irs_news".to_owned(),
                title,
                summary: summary.lines().take(3).collect::<Vec<_>>().join(" "),
                url,
                published_at: entry.published.or(entry.updated).map(|dt| dt.to_rfc3339()),
                confidence: confidence_for_score(score),
                score,
            })
        })
        .collect()
}

fn search_federal_register(client: &Client, query: &str) -> Result<Vec<TaxSourceItem>> {
    let response = client
        .get("https://www.federalregister.gov/api/v1/documents.json")
        .query(&[
            ("conditions[term]", query),
            ("per_page", "15"),
            ("order", "newest"),
        ])
        .send()
        .map_err(|e| AppError::AiService(format!("Failed to search Federal Register: {e}")))?;

    let body: FederalRegisterResponse = response.json().map_err(|e| {
        AppError::AiService(format!("Failed to parse Federal Register response: {e}"))
    })?;

    Ok(body
        .results
        .into_iter()
        .filter_map(|item| {
            let summary = item.abstract_text.unwrap_or_default();
            let agencies = item
                .agencies
                .unwrap_or_default()
                .into_iter()
                .map(|agency| agency.name)
                .collect::<Vec<_>>();
            let agency_text = agencies.join(" ");
            let tax_related = is_tax_related(&item.title, &summary)
                || agency_text
                    .to_lowercase()
                    .contains("internal revenue service")
                || agency_text.to_lowercase().contains("treasury");

            if !tax_related {
                return None;
            }

            let score = score_match(query, &item.title, &summary, 8);
            if score < 8 {
                return None;
            }

            Some(TaxSourceItem {
                source: "Federal Register".to_owned(),
                kind: item
                    .document_type
                    .unwrap_or_else(|| "federal_register".to_owned()),
                title: item.title,
                summary,
                url: item.html_url.or(item.pdf_url).unwrap_or_default(),
                published_at: item.publication_date,
                confidence: confidence_for_score(score),
                score,
            })
        })
        .filter(|item| !item.url.is_empty())
        .collect())
}

fn search_govinfo(client: &Client, query: &str, api_key: &str) -> Result<Vec<TaxSourceItem>> {
    let response = client
        .post(format!("https://api.govinfo.gov/search?api_key={api_key}"))
        .json(&serde_json::json!({
            "query": query,
            "pageSize": 10,
            "offsetMark": "*",
        }))
        .send()
        .map_err(|e| AppError::AiService(format!("Failed to search GovInfo: {e}")))?;

    let body: GovInfoResponse = response
        .json()
        .map_err(|e| AppError::AiService(format!("Failed to parse GovInfo response: {e}")))?;

    Ok(body
        .results
        .into_iter()
        .filter_map(|item| {
            let authors = item.government_author.unwrap_or_default();
            let summary = if authors.is_empty() {
                format!(
                    "Official government document from {}",
                    item.collection_code.as_deref().unwrap_or("GovInfo")
                )
            } else {
                format!("Official government document by {}", authors.join(", "))
            };

            let author_text = authors.join(" ");
            let tax_related = is_tax_related(&item.title, &summary)
                || author_text
                    .to_lowercase()
                    .contains("internal revenue service")
                || author_text.to_lowercase().contains("treasury")
                || matches!(
                    item.collection_code.as_deref(),
                    Some("FR") | Some("CFR") | Some("PLUMBOOK")
                );

            if !tax_related {
                return None;
            }

            let score = score_match(query, &item.title, &summary, 7);
            if score < 7 {
                return None;
            }

            Some(TaxSourceItem {
                source: "GovInfo".to_owned(),
                kind: item.collection_code.unwrap_or_else(|| "govinfo".to_owned()),
                title: item.title,
                summary,
                url: item
                    .download
                    .and_then(|download| download.pdf_link.or(download.txt_link))
                    .or(item.result_link)
                    .unwrap_or_default(),
                published_at: item.date_issued,
                confidence: confidence_for_score(score),
                score,
            })
        })
        .filter(|item| !item.url.is_empty())
        .collect())
}
