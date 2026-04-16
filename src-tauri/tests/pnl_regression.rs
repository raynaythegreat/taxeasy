/// Regression tests for the P&L LEFT JOIN date-filter leak (fix/pnl-leftjoin).
///
/// These tests call `compute_pnl` — the production SQL function — directly
/// against an in-memory SQLite database.  They prove that:
///   1. Transactions outside the requested period are NOT summed.
///   2. Draft transactions inside the period are NOT summed.
///   3. Only posted transactions within the half-open [from, to) window count.
use rusqlite::{params, Connection};
use rust_decimal::Decimal;
use taxeasy_lib::reports::pnl::compute_pnl;

/// Convert dollar-decimal to cents-i64 for readable assertions.
fn cents(d: Decimal) -> i64 {
    (d * Decimal::from(100)).round().mantissa() as i64
}

// ── Schema helpers (mirrors tests/reports/mod.rs without touching that file) ──

fn open_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../migrations/002_client.sql"))
        .unwrap();
    // Replay incremental migrations that add the `status` column and role column.
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

/// Insert a two-leg transaction (debit_acct debited, credit_acct credited).
fn insert_txn(
    conn: &Connection,
    date: &str,
    debit_acct: &str,
    credit_acct: &str,
    cents: i64,
    status: &str,
) {
    let txn_id = format!("txn-{date}-{debit_acct}-{cents}-{status}");
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

// ── Regression: date-filter leak ─────────────────────────────────────────────

/// Verifies that a transaction OUTSIDE the period is not counted.
///
/// Seed:
///   - 1 posted txn inside Q1 2024:  $100   (10_000 cents)
///   - 1 posted txn outside Q1 2024: $9999  (999_900 cents, dated 2024-06-01)
///   - 1 draft   txn inside Q1 2024: $500   (50_000 cents)
///
/// compute_pnl("2024-01-01", "2024-04-01") must return total_revenue == $100.
/// If the LEFT JOIN bug is present it would return $100 + $9999 + $500 = $10599.
#[test]
fn only_in_period_posted_transactions_are_counted() {
    let conn = open_db();

    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev1 = insert_account(&conn, "4010", "Revenue A", "revenue");
    let rev2 = insert_account(&conn, "4020", "Revenue B", "revenue");

    // Inside Q1, posted — MUST be counted ($100 = 10_000 cents)
    insert_txn(&conn, "2024-02-15", &cash, &rev1, 10_000, "posted");

    // Outside Q1 (June), posted — MUST NOT be counted ($9999 = 999_900 cents)
    insert_txn(&conn, "2024-06-01", &cash, &rev2, 999_900, "posted");

    // Inside Q1, draft — MUST NOT be counted ($500 = 50_000 cents)
    insert_txn(&conn, "2024-03-10", &cash, &rev1, 50_000, "draft");

    let report = compute_pnl(&conn, "2024-01-01", "2024-04-01")
        .expect("compute_pnl should succeed");

    // Expected: only the $100 posted-in-period transaction.
    // If LEFT JOIN bug is present this equals 10_000 + 999_900 + 50_000 = 1_059_900 cents.
    let total = cents(report.total_revenue);
    assert_eq!(
        total, 10_000,
        "total_revenue must be $100 (10_000 cents); got {} cents — \
         if ~1_059_900, the LEFT JOIN date-filter leak is present",
        total
    );
}

/// Verifies period isolation: only Q2 data appears when Q2 is requested.
#[test]
fn period_q2_returns_only_q2_data() {
    let conn = open_db();

    let cash = insert_account(&conn, "1010", "Cash", "asset");
    let rev  = insert_account(&conn, "4010", "Revenue", "revenue");

    // Q1 transaction — must NOT appear in Q2 report
    insert_txn(&conn, "2024-03-15", &cash, &rev, 30_000, "posted");

    // Q2 transaction — MUST appear ($250 = 25_000 cents)
    insert_txn(&conn, "2024-05-01", &cash, &rev, 25_000, "posted");

    // Q3 transaction — must NOT appear in Q2 report
    insert_txn(&conn, "2024-07-20", &cash, &rev, 80_000, "posted");

    let report = compute_pnl(&conn, "2024-04-01", "2024-07-01")
        .expect("compute_pnl should succeed");

    let total = cents(report.total_revenue);

    assert_eq!(
        total, 25_000,
        "Q2 total_revenue must be $250 (25_000 cents); got {} cents",
        total
    );
}
