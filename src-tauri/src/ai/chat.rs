use rusqlite::params;

pub fn chat_system_prompt() -> String {
    r#"You are a bookkeeping assistant for Taxeasy. You help with bookkeeping, tax, and accounting questions.
You can only reference the provided client data.
When asked to create a transaction, respond with a JSON block:
```json
{"transactions": [{"date": "YYYY-MM-DD", "description": "...", "amount": 0, "debit_account": "...", "credit_account": "..."}]}
```
Amounts must be in cents (integer). For example, $50.00 = 5000.
Never post anything automatically. You only suggest drafts.
If asked about unrelated topics, politely redirect to bookkeeping."#
        .to_owned()
}

pub fn chat_system_prompt_with_tools() -> String {
    let tools = crate::ai::tools::get_tool_definitions();
    let tools_text = crate::ai::tools::format_tools_for_prompt(&tools);

    format!(
        r#"You are a bookkeeping assistant for Taxeasy. You help with bookkeeping, tax, and accounting questions.

{tools_text}

When asked to create a transaction, use the create_transaction tool.
When asked about spending categories, use the categorize tool.
When asked a data question, use the query_ledger tool.
When asked for a report, use the run_report tool.
When asked about tax rules, filing requirements, IRS updates, or current tax guidance, use the lookup_tax_guidance tool before answering.

For general questions, respond normally with helpful bookkeeping advice.
Amounts are in cents (integer). $50.00 = 5000.
Never post anything automatically — you only create drafts.
When you answer with tax research, cite the official sources you used with source name, title, date if available, and URL.
If no official source is available, say that you could not verify the answer from an official source.
If asked about unrelated topics, politely redirect to bookkeeping."#
    )
}

pub fn build_chat_context(conn: &rusqlite::Connection, client_id: &str) -> String {
    let mut context = String::new();

    let client_info: Option<(String, Option<String>, Option<u8>)> = conn
        .query_row(
            "SELECT c.name, c.entity_type, c.fiscal_year_start_month FROM clients c WHERE c.id = ?1",
            params![client_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    if let Some((name, entity_type, fiscal_start)) = client_info {
        context.push_str(&format!("Business Name: {}\n", name));
        if let Some(et) = entity_type {
            context.push_str(&format!("Entity Type: {}\n", et));
        }
        if let Some(m) = fiscal_start {
            context.push_str(&format!("Fiscal Year Start Month: {}\n", m));
        }
        context.push('\n');
    }

    context.push_str("Chart of Accounts:\n");
    if let Ok(mut stmt) = conn.prepare(
        "SELECT name, account_type FROM accounts WHERE active = 1 ORDER BY sort_order, code",
    ) {
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();

        for (name, atype) in &rows {
            context.push_str(&format!("  {} ({})\n", name, atype));
        }
    }
    context.push('\n');

    context.push_str("Recent Transactions (last 20):\n");
    if let Ok(mut stmt) = conn.prepare(
        "SELECT t.txn_date, t.description, e.debit_cents, e.credit_cents
         FROM transactions t
         JOIN entries e ON e.transaction_id = t.id
         ORDER BY t.txn_date DESC, t.created_at DESC
         LIMIT 40",
    ) {
        let rows: Vec<(String, String, i64, i64)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();

        for (date, desc, debit, credit) in rows.iter().take(20) {
            let amount_cents = debit + credit;
            let amount_dollars = amount_cents as f64 / 100.0;
            context.push_str(&format!("  {} | {} | ${:.2}\n", date, desc, amount_dollars));
        }
    }

    context
}
