use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::Result;

#[derive(Debug, Clone, Default)]
pub struct ToolExecutionConfig {
    pub govinfo_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub input: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub name: String,
    pub output: Value,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRecord {
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_output: serde_json::Value,
    pub status: String,
}

pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "create_transaction".into(),
            description: "Create a draft transaction entry. Amounts are in cents (integer). $50.00 = 5000.".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Transaction date in YYYY-MM-DD format"},
                    "description": {"type": "string", "description": "Transaction description"},
                    "amount": {"type": "integer", "description": "Amount in cents (e.g. 5000 for $50.00)"},
                    "debit_account": {"type": "string", "description": "Account name to debit"},
                    "credit_account": {"type": "string", "description": "Account name to credit"}
                },
                "required": ["date", "description", "amount", "debit_account", "credit_account"]
            }),
        },
        ToolDefinition {
            name: "categorize".into(),
            description: "Auto-categorize a transaction line item by matching its description and amount to the chart of accounts.".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Transaction description"},
                    "amount": {"type": "integer", "description": "Amount in cents"}
                },
                "required": ["description"]
            }),
        },
        ToolDefinition {
            name: "query_ledger".into(),
            description: "Run a structured query against the ledger to retrieve transaction data. Use this to answer data questions.".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The data question to answer"},
                    "sql": {"type": "string", "description": "Optional SQL SELECT query. If not provided, a default query will be used."}
                },
                "required": ["question"]
            }),
        },
        ToolDefinition {
            name: "run_report".into(),
            description: "Generate a financial report summary (P&L, Balance Sheet, or Cash Flow) for a given date range.".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "report_type": {"type": "string", "enum": ["pnl", "balance_sheet", "cash_flow"], "description": "Type of report to generate"},
                    "date_from": {"type": "string", "description": "Start date in YYYY-MM-DD format"},
                    "date_to": {"type": "string", "description": "End date in YYYY-MM-DD format"}
                },
                "required": ["report_type"]
            }),
        },
        ToolDefinition {
            name: "lookup_tax_guidance".into(),
            description: "Search official tax sources such as IRS feeds, the Federal Register, and GovInfo for current tax guidance, filing updates, and regulatory changes.".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Tax question or topic to research"},
                    "max_results": {"type": "integer", "description": "Maximum number of official sources to return"}
                },
                "required": ["query"]
            }),
        },
    ]
}

pub fn format_tools_for_prompt(tools: &[ToolDefinition]) -> String {
    let mut parts = vec![
        "You have access to these tools. To call a tool, respond with EXACTLY this format on its own line:".to_owned(),
        "[TOOL_CALL] {\"name\": \"tool_name\", \"input\": {...}}".to_owned(),
        "The tool result will be provided. You may call multiple tools in sequence.".to_owned(),
        String::new(),
    ];

    for tool in tools {
        parts.push(format!("### {}", tool.name));
        parts.push(tool.description.clone());
        if let Some(props) = tool.input_schema.get("properties") {
            parts.push("Input parameters:".to_owned());
            if let Some(obj) = props.as_object() {
                for (key, schema) in obj {
                    let type_str = schema.get("type").and_then(|v| v.as_str()).unwrap_or("any");
                    let desc = schema
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    parts.push(format!("  - {} ({}): {}", key, type_str, desc));
                }
            }
        }
        if let Some(required) = tool.input_schema.get("required").and_then(|v| v.as_array()) {
            let reqs: Vec<&str> = required.iter().filter_map(|v| v.as_str()).collect();
            parts.push(format!("  Required: {}", reqs.join(", ")));
        }
        parts.push(String::new());
    }

    parts.join("\n")
}

pub fn parse_tool_calls(response: &str) -> Vec<ToolCall> {
    let mut calls = Vec::new();
    let marker = "[TOOL_CALL]";

    for line in response.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(marker) {
            let rest = rest.trim();
            if let Ok(v) = serde_json::from_str::<Value>(rest) {
                if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                    let input = v
                        .get("input")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default()));
                    calls.push(ToolCall {
                        name: name.to_owned(),
                        input,
                    });
                }
            }
        }
    }

    calls
}

fn find_account_id_by_name(conn: &Connection, name: &str) -> Option<String> {
    conn.query_row(
        "SELECT id FROM accounts WHERE name = ?1 AND active = 1",
        params![name],
        |row| row.get(0),
    )
    .ok()
}

fn execute_create_transaction(conn: &Connection, client_id: &str, input: &Value) -> Result<Value> {
    let date = input["date"].as_str().unwrap_or("");
    let description = input["description"].as_str().unwrap_or("");
    let amount = input["amount"].as_i64().unwrap_or(0);
    let debit_name = input["debit_account"].as_str().unwrap_or("");
    let credit_name = input["credit_account"].as_str().unwrap_or("");

    let debit_account_id = find_account_id_by_name(conn, debit_name);
    let credit_account_id = find_account_id_by_name(conn, credit_name);

    if debit_account_id.is_none() {
        return Ok(serde_json::json!({
            "error": format!("Debit account '{}' not found in chart of accounts", debit_name)
        }));
    }
    if credit_account_id.is_none() {
        return Ok(serde_json::json!({
            "error": format!("Credit account '{}' not found in chart of accounts", credit_name)
        }));
    }

    let draft = crate::db::draft_db::insert_draft(
        conn,
        client_id,
        None,
        Some(date),
        Some(description),
        None,
        debit_account_id.as_deref(),
        credit_account_id.as_deref(),
        Some(amount),
        None,
    )?;

    Ok(serde_json::json!({
        "draft_id": draft.id,
        "date": date,
        "description": description,
        "amount": amount,
        "debit_account": debit_name,
        "credit_account": credit_name,
        "status": "pending"
    }))
}

fn execute_categorize(conn: &Connection, _client_id: &str, input: &Value) -> Result<Value> {
    let description = input["description"].as_str().unwrap_or("");
    let _amount = input["amount"].as_i64();

    let mut stmt = conn.prepare(
        "SELECT id, code, name, account_type FROM accounts WHERE active = 1 ORDER BY sort_order, code",
    )?;

    let accounts: Vec<(String, String, String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let desc_lower = description.to_lowercase();
    let mut best_match: Option<(&str, &str, &str, &str)> = None;
    let mut best_score = 0;

    for (id, code, name, atype) in &accounts {
        let name_lower = name.to_lowercase();
        let words: Vec<&str> = desc_lower.split_whitespace().collect();
        let mut score = 0;
        for word in &words {
            if name_lower.contains(word) {
                score += 1;
            }
        }
        if score > best_score {
            best_score = score;
            best_match = Some((id, code, name, atype));
        }
    }

    match best_match {
        Some((id, code, name, atype)) => Ok(serde_json::json!({
            "account_id": id,
            "code": code,
            "account_name": name,
            "account_type": atype,
            "confidence": if best_score > 2 { "high" } else if best_score > 0 { "medium" } else { "low" }
        })),
        None => Ok(serde_json::json!({
            "error": "No matching account found",
            "suggestion": "Please specify the account name from the chart of accounts"
        })),
    }
}

fn execute_query_ledger(conn: &Connection, input: &Value) -> Result<Value> {
    let _question = input["question"].as_str().unwrap_or("");
    let sql = input["sql"].as_str().unwrap_or(
        "SELECT t.txn_date, t.description, e.debit_cents, e.credit_cents \
         FROM transactions t JOIN entries e ON e.transaction_id = t.id \
         ORDER BY t.txn_date DESC LIMIT 20",
    );

    let sql_trimmed = sql.trim();
    let sql_upper = sql_trimmed.to_uppercase();
    if !sql_upper.starts_with("SELECT") {
        return Ok(serde_json::json!({
            "error": "Only SELECT queries are allowed"
        }));
    }

    let mut stmt = match conn.prepare(sql_trimmed) {
        Ok(s) => s,
        Err(e) => {
            return Ok(serde_json::json!({
                "error": format!("Invalid SQL: {}", e)
            }))
        }
    };

    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("col").to_owned())
        .collect();

    let rows: Vec<Value> = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in col_names.iter().enumerate() {
                let val: rusqlite::types::Value = row.get(i)?;
                let json_val = match val {
                    rusqlite::types::Value::Null => Value::Null,
                    rusqlite::types::Value::Integer(n) => Value::Number(n.into()),
                    rusqlite::types::Value::Real(f) => serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null),
                    rusqlite::types::Value::Text(s) => Value::String(s),
                    rusqlite::types::Value::Blob(_) => Value::String("[blob]".into()),
                };
                map.insert(name.clone(), json_val);
            }
            Ok(Value::Object(map))
        })
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    Ok(serde_json::json!({
        "rows": rows,
        "row_count": rows.len()
    }))
}

fn execute_run_report(conn: &Connection, input: &Value) -> Result<Value> {
    let report_type = input["report_type"].as_str().unwrap_or("pnl");
    let date_from = input["date_from"].as_str().unwrap_or("");
    let date_to = input["date_to"].as_str().unwrap_or("");

    let mut date_filter = String::new();
    let mut param_values: Vec<&str> = Vec::new();

    if !date_from.is_empty() && !date_to.is_empty() {
        date_filter = "AND t.txn_date >= ? AND t.txn_date <= ?".to_string();
        param_values.push(date_from);
        param_values.push(date_to);
    } else if !date_from.is_empty() {
        date_filter = "AND t.txn_date >= ?".to_string();
        param_values.push(date_from);
    } else if !date_to.is_empty() {
        date_filter = "AND t.txn_date <= ?".to_string();
        param_values.push(date_to);
    }

    match report_type {
        "pnl" => {
            let sql = format!(
                "SELECT a.name, a.account_type, SUM(e.debit_cents) as total_debits, SUM(e.credit_cents) as total_credits
                 FROM entries e
                 JOIN transactions t ON t.id = e.transaction_id
                 JOIN accounts a ON a.id = e.account_id
                 WHERE a.account_type IN ('revenue', 'expense') {}
                 GROUP BY a.id
                 ORDER BY a.account_type, a.sort_order",
                date_filter
            );
            let mut stmt = conn.prepare(&sql)?;

            let rows: Vec<Value> = stmt
                .query_map(rusqlite::params_from_iter(param_values.iter()), |row| {
                    Ok(serde_json::json!({
                        "account": row.get::<_, String>(0)?,
                        "type": row.get::<_, String>(1)?,
                        "debits": row.get::<_, i64>(2)?,
                        "credits": row.get::<_, i64>(3)?,
                    }))
                })?
                .filter_map(|r| r.ok())
                .collect();

            let total_revenue: i64 = rows
                .iter()
                .filter(|r| r["type"].as_str() == Some("revenue"))
                .map(|r| r["credits"].as_i64().unwrap_or(0) - r["debits"].as_i64().unwrap_or(0))
                .sum();
            let total_expenses: i64 = rows
                .iter()
                .filter(|r| r["type"].as_str() == Some("expense"))
                .map(|r| r["debits"].as_i64().unwrap_or(0) - r["credits"].as_i64().unwrap_or(0))
                .sum();

            Ok(serde_json::json!({
                "report_type": "pnl",
                "date_from": date_from,
                "date_to": date_to,
                "total_revenue": total_revenue,
                "total_expenses": total_expenses,
                "net_income": total_revenue - total_expenses,
                "line_items": rows
            }))
        }
        "balance_sheet" | "cash_flow" => {
            let sql = format!(
                "SELECT a.name, a.account_type, SUM(e.debit_cents) as total_debits, SUM(e.credit_cents) as total_credits
                 FROM entries e
                 JOIN transactions t ON t.id = e.transaction_id
                 JOIN accounts a ON a.id = e.account_id
                 WHERE 1=1 {}
                 GROUP BY a.id
                 ORDER BY a.account_type, a.sort_order",
                date_filter
            );
            let mut stmt = conn.prepare(&sql)?;

            let rows: Vec<Value> = stmt
                .query_map(rusqlite::params_from_iter(param_values.iter()), |row| {
                    Ok(serde_json::json!({
                        "account": row.get::<_, String>(0)?,
                        "type": row.get::<_, String>(1)?,
                        "debits": row.get::<_, i64>(2)?,
                        "credits": row.get::<_, i64>(3)?,
                    }))
                })?
                .filter_map(|r| r.ok())
                .collect();

            Ok(serde_json::json!({
                "report_type": report_type,
                "date_from": date_from,
                "date_to": date_to,
                "line_items": rows
            }))
        }
        _ => Ok(serde_json::json!({
            "error": format!("Unknown report type: {}", report_type)
        })),
    }
}

fn execute_lookup_tax_guidance(input: &Value, config: &ToolExecutionConfig) -> Result<Value> {
    let query = input["query"].as_str().unwrap_or("").trim();
    let max_results = input["max_results"].as_u64().unwrap_or(5).clamp(1, 8) as usize;

    if query.is_empty() {
        return Ok(serde_json::json!({
            "error": "query is required"
        }));
    }

    let sources = crate::ai::tax_sources::lookup_tax_guidance(
        query,
        &crate::ai::tax_sources::TaxLookupConfig {
            govinfo_api_key: config.govinfo_api_key.clone(),
        },
        max_results,
    )?;

    let summary = if sources.is_empty() {
        "No official tax sources matched this question. Ask a narrower question or add a GovInfo API key for broader document search.".to_owned()
    } else {
        format!(
            "Found {} official source{} from IRS, Federal Register, and GovInfo.",
            sources.len(),
            if sources.len() == 1 { "" } else { "s" }
        )
    };

    Ok(serde_json::json!({
        "query": query,
        "summary": summary,
        "sources": sources,
        "govinfo_enabled": config
            .govinfo_api_key
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
    }))
}

pub fn execute_tool(
    conn: &Connection,
    client_id: &str,
    tool_call: &ToolCall,
    config: &ToolExecutionConfig,
) -> Result<ToolResult> {
    let output = match tool_call.name.as_str() {
        "create_transaction" => execute_create_transaction(conn, client_id, &tool_call.input),
        "categorize" => execute_categorize(conn, client_id, &tool_call.input),
        "query_ledger" => execute_query_ledger(conn, &tool_call.input),
        "run_report" => execute_run_report(conn, &tool_call.input),
        "lookup_tax_guidance" => execute_lookup_tax_guidance(&tool_call.input, config),
        _ => Ok(serde_json::json!({
            "error": format!("Unknown tool: {}", tool_call.name)
        })),
    };

    match output {
        Ok(value) => Ok(ToolResult {
            name: tool_call.name.clone(),
            output: value,
            status: "success".into(),
        }),
        Err(e) => Ok(ToolResult {
            name: tool_call.name.clone(),
            output: serde_json::json!({"error": e.to_string()}),
            status: "error".into(),
        }),
    }
}
