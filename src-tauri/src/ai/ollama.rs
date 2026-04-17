use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{error::{AppError, Result}, state::AppState};

pub struct AiConfig {
    pub provider: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub lm_studio_url: String,
    pub lm_studio_model: String,
}

fn looks_like_ocr_or_embedding_model(model: &str) -> bool {
    let lower = model.trim().to_lowercase();
    lower.contains("glm-ocr")
        || lower.contains("embed")
        || lower.contains("embedding")
        || lower.contains("rerank")
        || lower.contains("whisper")
}

fn preferred_ollama_model(models: &[String]) -> Option<String> {
    let preferred_prefixes = [
        "qwen2.5",
        "qwen3",
        "llama3.2",
        "llama3.1",
        "gemma3",
        "gemma2",
        "mistral",
        "deepseek",
        "phi4",
        "phi3",
    ];

    for prefix in preferred_prefixes {
        if let Some(model) = models.iter().find(|name| {
            let lower = name.to_lowercase();
            lower.starts_with(prefix) && !looks_like_ocr_or_embedding_model(name)
        }) {
            return Some(model.clone());
        }
    }

    models
        .iter()
        .find(|name| !looks_like_ocr_or_embedding_model(name))
        .cloned()
}

pub async fn resolve_ollama_chat_model(url: &str, configured_model: &str) -> Result<String> {
    if !configured_model.trim().is_empty() && !looks_like_ocr_or_embedding_model(configured_model) {
        return Ok(configured_model.trim().to_owned());
    }

    let models = crate::ai::lmstudio::ollama_list_models(url.to_owned()).await?;
    preferred_ollama_model(&models).ok_or_else(|| {
        AppError::AiService(
            "No suitable Ollama text model found. Pull a local chat model like qwen2.5, llama3.2, gemma, or mistral.".into(),
        )
    })
}

pub fn read_ai_config(state: &tauri::State<'_, AppState>) -> AiConfig {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref();
    let get = |conn: &rusqlite::Connection, key: &str, def: &str| -> String {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| def.to_owned())
    };

    match db {
        Some(d) => {
            let conn = d.conn();
            AiConfig {
                provider: get(conn, "ai_provider", "ollama"),
                ollama_url: get(conn, "ollama_url", "http://localhost:11434"),
                ollama_model: get(conn, "ollama_model", ""),
                lm_studio_url: get(conn, "lm_studio_url", "http://localhost:1234"),
                lm_studio_model: get(conn, "lm_studio_model", ""),
            }
        }
        None => AiConfig {
            provider: "ollama".into(),
            ollama_url: "http://localhost:11434".into(),
            ollama_model: "".into(),
            lm_studio_url: "http://localhost:1234".into(),
            lm_studio_model: "".into(),
        },
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn ollama_health() -> bool {
    let client = Client::new();
    match client
        .get("http://localhost:11434/api/tags")
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn check_ai_health_with_url(url: String) -> bool {
    let client = Client::new();
    let is_lmstudio = url.contains("1234");
    let endpoint = if is_lmstudio {
        format!("{}/v1/models", url.trim_end_matches('/'))
    } else {
        format!("{}/api/tags", url.trim_end_matches('/'))
    };
    match client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

async fn ollama_complete(url: &str, model: &str, prompt: &str) -> Result<String> {
    let client = Client::new();
    let body = GenerateRequest {
        model,
        prompt,
        stream: false,
    };
    let resp = client
        .post(format!("{}/api/generate", url.trim_end_matches('/')))
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!("Ollama returned {}", resp.status())));
    }

    let gen: GenerateResponse = resp.json().await.map_err(|e| AppError::AiService(e.to_string()))?;
    Ok(gen.response.trim().to_owned())
}

pub async fn ai_complete(config: &AiConfig, prompt: &str) -> Result<String> {
    match config.provider.as_str() {
        "lmstudio" => {
            let model = if config.lm_studio_model.is_empty() {
                return Err(AppError::AiService("No LM Studio model selected".into()));
            } else {
                &config.lm_studio_model
            };
            crate::ai::lmstudio::lmstudio_complete(&config.lm_studio_url, model, prompt).await
        }
        _ => {
            let model = resolve_ollama_chat_model(&config.ollama_url, &config.ollama_model).await?;
            ollama_complete(&config.ollama_url, &model, prompt).await
        }
    }
}

// ── Auto-categorization ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CategorizeSuggestion {
    pub account_id: String,
    pub account_name: String,
    pub confidence: f32,
    pub reason: String,
}

/// Suggest which account a transaction belongs to, given its description and amount.
#[tauri::command(rename_all = "camelCase")]
pub async fn suggest_category(
    description: String,
    amount_str: String,
    state: tauri::State<'_, AppState>,
) -> Result<CategorizeSuggestion> {
    let config = read_ai_config(&state);

    let (accounts_text, accounts_vec) = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = ac.db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, code, name, account_type FROM accounts WHERE active = 1 ORDER BY sort_order, code",
        )?;
        let rows: Vec<(String, String, String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
            .filter_map(|r| r.ok())
            .collect();

        let text = rows
            .iter()
            .map(|(_, code, name, atype)| format!("{code} | {name} | {atype}"))
            .collect::<Vec<_>>()
            .join("\n");
        (text, rows)
    };

    let prompt = format!(
        r#"You are a bookkeeper. Given the transaction description and amount, identify the single best chart-of-accounts category from the list below.

Transaction: "{description}" — Amount: ${amount_str}

Chart of Accounts:
{accounts_text}

Respond in JSON only, no markdown, exactly this shape:
{{"code":"XXXX","reason":"one sentence"}}
"#
    );

    let raw = ai_complete(&config, &prompt).await?;

    // Parse JSON response
    let v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| AppError::AiService("model returned invalid JSON".into()))?;
    let code = v["code"].as_str().unwrap_or("").trim().to_owned();

    // Find matching account
    let matching = accounts_vec
        .iter()
        .find(|(_, c, _, _)| c.trim() == code)
        .ok_or_else(|| AppError::AiService(format!("model returned unknown code: {code}")))?;

    Ok(CategorizeSuggestion {
        account_id: matching.0.clone(),
        account_name: matching.2.clone(),
        confidence: 0.85,
        reason: v["reason"].as_str().unwrap_or("").to_owned(),
    })
}

// ── Natural-language query ────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct NlQueryResult {
    pub sql: String,
    pub rows: Vec<serde_json::Value>,
    pub summary: String,
}

/// Execute a natural-language query against the client's ledger.
/// The LLM generates read-only SQL; we execute it on a SELECT-only connection.
#[tauri::command(rename_all = "camelCase")]
pub async fn nl_query(
    question: String,
    state: tauri::State<'_, AppState>,
) -> Result<NlQueryResult> {
    let config = read_ai_config(&state);

    let schema = r#"
Tables:
  transactions(id, txn_date TEXT, description TEXT, reference, locked, created_at)
  entries(id, transaction_id, account_id, debit_cents INTEGER, credit_cents INTEGER, memo)
  accounts(id, code, name, account_type TEXT, parent_id, schedule_c_line)

Rules:
- Money is stored in integer cents; divide by 100 for dollar amounts.
- account_type values: asset, liability, equity, revenue, expense
- txn_date format: YYYY-MM-DD
"#;

    let prompt = format!(
        r#"You are a SQLite expert. Generate a single read-only SELECT query to answer the question.

Schema:
{schema}

Question: {question}

Rules:
- Return ONLY the SQL statement, no markdown, no explanation.
- Use only SELECT; no INSERT/UPDATE/DELETE/DROP.
- Format money as dollar amounts (divide cents columns by 100.0).
"#
    );

    let sql = ai_complete(&config, &prompt).await?;

    // Sanitize: only SELECT allowed
    let sql_upper = sql.trim().to_uppercase();
    if !sql_upper.starts_with("SELECT") {
        return Err(AppError::AiService("model generated a non-SELECT query".into()));
    }

    // Use an immediately-invoked closure so that `?` returns from the *closure*,
    // not the outer async fn. This keeps MutexGuard / Statement / Connection refs
    // (all non-Send) scoped entirely within the closure and out of the async future.
    let rows: Vec<serde_json::Value> = (|| -> Result<Vec<serde_json::Value>> {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = ac.db.conn();

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::AiService(format!("invalid SQL: {e}")))?;

        let col_count = stmt.column_count();
        let col_names: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap_or("col").to_owned())
            .collect();

        let rows = stmt
            .query_map([], |row| {
                let mut map = serde_json::Map::new();
                for (i, name) in col_names.iter().enumerate() {
                    let val: rusqlite::types::Value = row.get(i)?;
                    let json_val = match val {
                        rusqlite::types::Value::Null => serde_json::Value::Null,
                        rusqlite::types::Value::Integer(n) => serde_json::Value::Number(n.into()),
                        rusqlite::types::Value::Real(f) => {
                            serde_json::Number::from_f64(f)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        }
                        rusqlite::types::Value::Text(s) => serde_json::Value::String(s),
                        rusqlite::types::Value::Blob(_) => serde_json::Value::String("[blob]".into()),
                    };
                    map.insert(name.clone(), json_val);
                }
                Ok(serde_json::Value::Object(map))
            })
            .map_err(|e| AppError::AiService(format!("query error: {e}")))?
            .filter_map(|r| r.ok())
            .collect();
        // stmt, conn, ac, lock all dropped here when closure returns
        Ok(rows)
    })()?; // ? on the closure result propagates to the outer fn after all locals are dropped

    // Now safe to await — no non-Send types in scope
    let results_str = serde_json::to_string_pretty(&rows).unwrap_or_default();
    let summary_prompt = format!(
        r#"Summarize these query results in one plain-English sentence for a business owner.
Question: {question}
Results: {results_str}
Summary:"#
    );
    let summary = ai_complete(&config, &summary_prompt).await.unwrap_or_default();

    Ok(NlQueryResult { sql, rows, summary })
}
