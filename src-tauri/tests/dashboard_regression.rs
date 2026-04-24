/// Regression tests for the dashboard account-balance date-filter leak (fix/dashboard-leftjoin).
///
/// Root cause: the account_balances query used LEFT JOIN transactions with the date filter
/// and status filter in the ON clause.  Because the join is LEFT, entries whose transactions
/// fail the filter still appear with NULL transaction columns, but SUM(e.debit_cents) and
/// SUM(e.credit_cents) aggregate them regardless — the period filter silently did nothing.
///
/// Fix: wrap the sums in CASE WHEN t.id IS NOT NULL so only entries whose transactions
/// satisfied every ON-clause condition (status='posted' AND date in range) are counted.
use rusqlite::{params, Connection};

// ── Schema helpers (mirrors tests/reports/mod.rs) ────────────────────────────

fn open_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../migrations/002_client.sql"))
        .unwrap();
    conn.execute_batch(
        "ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'posted'
             CHECK (status IN ('draft','posted','void'));
         CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);",
    )
    .unwrap();
    conn.execute_batch(
        "ALTER TABLE accounts ADD COLUMN system_account_role TEXT
             CHECK (system_account_role IS NULL OR system_account_role IN (
                 'cash','accounts_receivable','accounts_payable',
                 'equipment','long_term_loans','owners_draw'
             ));",
    )
    .unwrap();
    conn
}

fn insert_account(conn: &Connection, code: &str, name: &str, atype: &str) -> String {
    let id = format!("acct-{code}");
    conn.execute(
        "INSERT INTO accounts (id, code, name, account_type, active, sort_order)
         VALUES (?1, ?2, ?3, ?4, 1, 0)",
        params![id, code, name, atype],
    )
    .unwrap();
    id
}

fn insert_txn(
    conn: &Connection,
    date: &str,
    debit_acct: &str,
    credit_acct: &str,
    cents: i64,
    status: &str,
) -> String {
    let txn_id = format!("txn-{date}-{debit_acct}-{cents}");
    conn.execute(
        "INSERT INTO transactions (id, txn_date, description, locked, status)
         VALUES (?1, ?2, 'test', 0, ?3)",
        params![txn_id, date, status],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
         VALUES (?1, ?2, ?3, ?4, 0)",
        params![format!("{txn_id}-dr"), txn_id, debit_acct, cents],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
         VALUES (?1, ?2, ?3, 0, ?4)",
        params![format!("{txn_id}-cr"), txn_id, credit_acct, cents],
    )
    .unwrap();
    txn_id
}

/// Run the fixed account_balances aggregation query for a half-open [start, end) range.
/// Returns (dr_cents, cr_cents) for a given account_type.
fn account_balance_for_period(
    conn: &Connection,
    account_type: &str,
    start: &str,
    end: &str,
) -> (i64, i64) {
    // This is the exact fixed SQL from compute_dashboard_stats — CASE WHEN t.id IS NOT NULL
    // ensures entries whose transactions failed the ON-clause filter are not summed.
    let mut stmt = conn
        .prepare(
            "SELECT a.account_type,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.debit_cents  ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.credit_cents ELSE 0 END), 0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.status = 'posted'
             AND t.txn_date >= ?1
             AND t.txn_date < ?2
         WHERE a.active = 1
           AND a.account_type = ?3
         GROUP BY a.account_type",
        )
        .unwrap();

    stmt.query_row(params![start, end, account_type], |row| {
        Ok((row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
    })
    .unwrap_or((0, 0))
}

/// Run the BUGGY (unfixed) query to demonstrate what the bug looked like.
/// Uses plain SUM without the CASE WHEN guard — entries bleed across periods.
fn buggy_account_balance_for_period(
    conn: &Connection,
    account_type: &str,
    start: &str,
    end: &str,
) -> (i64, i64) {
    let mut stmt = conn
        .prepare(
            "SELECT a.account_type,
                COALESCE(SUM(e.debit_cents), 0) AS dr,
                COALESCE(SUM(e.credit_cents), 0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.status = 'posted'
             AND t.txn_date >= ?1
             AND t.txn_date < ?2
         WHERE a.active = 1
           AND a.account_type = ?3
         GROUP BY a.account_type",
        )
        .unwrap();

    stmt.query_row(params![start, end, account_type], |row| {
        Ok((row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
    })
    .unwrap_or((0, 0))
}

// ── Bug demonstration ─────────────────────────────────────────────────────────

/// The bug: without the CASE WHEN guard, Q1 revenue shows ALL-TIME credits because
/// entries from out-of-range transactions still have non-NULL debit_cents/credit_cents
/// even when their transaction row is NULLed out by the LEFT JOIN.
#[test]
fn bug_demonstration_unfixed_query_leaks_out_of_range_entries() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");

    // Q1 posted: $1000
    insert_txn(&conn, "2024-01-15", &cash, &rev, 100_000, "posted");
    // Q3 posted: $9999 — should NOT appear in Q1 query
    insert_txn(&conn, "2024-07-15", &cash, &rev, 999_900, "posted");
    // Q1 draft: $500 — should NOT appear (wrong status)
    insert_txn(&conn, "2024-02-01", &cash, &rev, 50_000, "draft");

    // The buggy query returns ALL entries regardless of the date filter
    let (_, buggy_cr) =
        buggy_account_balance_for_period(&conn, "revenue", "2024-01-01", "2024-04-01");
    // Buggy: leaks Q3 and draft entries → 100_000 + 999_900 + 50_000 = 1_149_900
    assert_eq!(
        buggy_cr, 1_149_900,
        "buggy query must return all entries to confirm the bug exists"
    );
}

// ── Regression tests for the fix ─────────────────────────────────────────────

/// Q1 revenue should be exactly $1000 — not contaminated by Q3 or draft transactions.
#[test]
fn q1_revenue_excludes_q3_and_draft_transactions() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");

    // Q1 posted: $1000
    insert_txn(&conn, "2024-01-15", &cash, &rev, 100_000, "posted");
    // Q3 posted: $9999 — outside Q1 range
    insert_txn(&conn, "2024-07-15", &cash, &rev, 999_900, "posted");
    // Q1 draft: $500 — wrong status
    insert_txn(&conn, "2024-02-01", &cash, &rev, 50_000, "draft");

    // Revenue is credit-normal: cr > 0 when revenue earned
    let (_, cr) = account_balance_for_period(&conn, "revenue", "2024-01-01", "2024-04-01");
    assert_eq!(
        cr, 100_000,
        "Q1 revenue must be exactly $1000 (100_000 cents)"
    );
}

/// Q3 revenue should be exactly $9999 — not contaminated by Q1 transactions.
#[test]
fn q3_revenue_excludes_q1_transactions() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");

    // Q1 posted: $1000
    insert_txn(&conn, "2024-01-15", &cash, &rev, 100_000, "posted");
    // Q3 posted: $9999
    insert_txn(&conn, "2024-07-15", &cash, &rev, 999_900, "posted");
    // Q1 draft: $500
    insert_txn(&conn, "2024-02-01", &cash, &rev, 50_000, "draft");

    let (_, cr) = account_balance_for_period(&conn, "revenue", "2024-07-01", "2024-10-01");
    assert_eq!(
        cr, 999_900,
        "Q3 revenue must be exactly $9999 (999_900 cents)"
    );
}

/// Accounts with zero activity in the period must still appear (LEFT JOIN is correct).
#[test]
fn accounts_with_no_activity_in_period_return_zero_balance() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");

    // Only Q3 activity — Q1 query should yield zero, not omit the account
    insert_txn(&conn, "2024-07-15", &cash, &rev, 100_000, "posted");

    let (dr, cr) = account_balance_for_period(&conn, "revenue", "2024-01-01", "2024-04-01");
    assert_eq!(dr, 0, "revenue dr must be 0 when no Q1 transactions exist");
    assert_eq!(cr, 0, "revenue cr must be 0 when no Q1 transactions exist");
}

/// Draft transactions must not appear regardless of date range.
#[test]
fn draft_transactions_excluded_from_account_balances() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");

    insert_txn(&conn, "2024-03-01", &cash, &rev, 200_000, "posted");
    insert_txn(&conn, "2024-03-15", &cash, &rev, 50_000, "draft");

    let (_, cr) = account_balance_for_period(&conn, "revenue", "2024-01-01", "2024-04-01");
    assert_eq!(cr, 200_000, "draft must not appear in account balances");
}

/// Multiple account types are each correctly filtered.
#[test]
fn multiple_account_types_filtered_independently_per_period() {
    let conn = open_db();
    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev = insert_account(&conn, "4010", "Revenue", "revenue");
    let exp = insert_account(&conn, "6010", "Expense", "expense");

    // Q1: $1000 revenue, $200 expense
    insert_txn(&conn, "2024-02-01", &cash, &rev, 100_000, "posted"); // revenue credit
    insert_txn(&conn, "2024-02-15", &exp, &cash, 20_000, "posted"); // expense debit

    // Q3: $5000 revenue, $800 expense — must not bleed into Q1
    insert_txn(&conn, "2024-08-01", &cash, &rev, 500_000, "posted");
    insert_txn(&conn, "2024-08-15", &exp, &cash, 80_000, "posted");

    let (_, rev_cr) = account_balance_for_period(&conn, "revenue", "2024-01-01", "2024-04-01");
    let (exp_dr, _) = account_balance_for_period(&conn, "expense", "2024-01-01", "2024-04-01");

    assert_eq!(rev_cr, 100_000, "Q1 revenue credit must be $1000");
    assert_eq!(exp_dr, 20_000, "Q1 expense debit must be $200");
}
