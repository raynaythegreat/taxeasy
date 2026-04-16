/// Regression tests for the Balance Sheet LEFT JOIN as_of_date leak (Bug #1).
///
/// These tests call `compute_balance_sheet` directly (the pure inner function)
/// against an in-memory SQLite DB to verify that:
///   - only posted transactions on or before as_of_date are counted
///   - draft transactions are excluded regardless of date
///   - future posted transactions are excluded
use rusqlite::{params, Connection};
use taxeasy_lib::reports::balance_sheet::compute_balance_sheet;

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
) {
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
}

// ── Regression: as_of_date filter must exclude future posted transactions ─────

#[test]
fn cash_balance_respects_as_of_date() {
    let conn = open_db();

    let cash   = insert_account(&conn, "1010", "Cash",          "asset");
    let equity = insert_account(&conn, "3010", "Owner's Equity","equity");

    // Transaction A: 2024-02-15, posted, $500 — should be included at Mar 31
    insert_txn(&conn, "2024-02-15", &cash, &equity, 50_000, "posted");
    // Transaction B: 2024-06-15, posted, $9999 — AFTER as_of_date, must be excluded
    insert_txn(&conn, "2024-06-15", &cash, &equity, 999_900, "posted");
    // Transaction C: 2024-02-20, draft, $777 — draft, must be excluded always
    insert_txn(&conn, "2024-02-20", &cash, &equity, 77_700, "draft");

    // Period-scoped BS: [Jan 1, Apr 1) includes A (Feb 15) but not B (Jun 15).
    let report = compute_balance_sheet(&conn, "2024-01-01", "2024-04-01", 1).unwrap();

    // Cash = $500 only (A).  B is outside the period; C is a draft.
    let cash_line = report
        .asset_lines
        .iter()
        .find(|l| l.code == "1010")
        .expect("Cash account must appear in asset_lines");

    assert_eq!(
        cash_line.balance,
        rust_decimal::Decimal::new(500_00, 2),
        "Cash balance at Mar 31 must be $500 (only transaction A)"
    );
    assert_eq!(
        report.total_assets,
        rust_decimal::Decimal::new(500_00, 2),
        "Total assets at Mar 31 must be $500"
    );
}

// ── Regression: year-end includes all posted transactions through Dec 31 ──────

#[test]
fn cash_balance_year_end_includes_all_posted() {
    let conn = open_db();

    let cash   = insert_account(&conn, "1010", "Cash",          "asset");
    let equity = insert_account(&conn, "3010", "Owner's Equity","equity");

    // Transaction A: 2024-02-15, posted, $500
    insert_txn(&conn, "2024-02-15", &cash, &equity, 50_000, "posted");
    // Transaction B: 2024-06-15, posted, $9999
    insert_txn(&conn, "2024-06-15", &cash, &equity, 999_900, "posted");
    // Transaction C: 2024-02-20, draft, $777 — still excluded
    insert_txn(&conn, "2024-02-20", &cash, &equity, 77_700, "draft");

    // Period-scoped BS: full calendar year 2024 half-open → includes both A and B.
    let report = compute_balance_sheet(&conn, "2024-01-01", "2025-01-01", 1).unwrap();

    // Cash = $500 + $9999 = $10499.  Draft is still excluded.
    let cash_line = report
        .asset_lines
        .iter()
        .find(|l| l.code == "1010")
        .expect("Cash account must appear in asset_lines");

    assert_eq!(
        cash_line.balance,
        rust_decimal::Decimal::new(10_499_00, 2),
        "Cash balance at Dec 31 must be $10499 (A + B)"
    );
}
