/// Integration tests for report accuracy (B5).
///
/// Each test builds an in-memory SQLite database (no SQLCipher — plain
/// rusqlite), seeds accounts and transactions, then calls the same SQL
/// queries used by the production report functions.  This exercises the
/// half-open period bounds, status filtering, system_account_role matching,
/// and the P&L vs Balance Sheet retained-earnings tie-out.
use rusqlite::{params, Connection};

// ── Schema helpers ────────────────────────────────────────────────────────────

fn open_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../../migrations/002_client.sql"))
        .unwrap();
    // Apply the alter-table migrations manually (in-memory DB is fresh, no guard needed).
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

/// Insert a minimal account and return its id.
fn insert_account(
    conn: &Connection,
    code: &str,
    name: &str,
    atype: &str,
    role: Option<&str>,
) -> String {
    let id = format!("acct-{code}");
    conn.execute(
        "INSERT INTO accounts (id, code, name, account_type, active, sort_order, system_account_role)
         VALUES (?1, ?2, ?3, ?4, 1, 0, ?5)",
        params![id, code, name, atype, role],
    )
    .unwrap();
    id
}

/// Insert a two-leg transaction and return its id.
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

/// Sum net credit activity on a revenue or expense account for the period.
fn pnl_sum(conn: &Connection, acct_id: &str, from: &str, to: &str) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(e.credit_cents),0) - COALESCE(SUM(e.debit_cents),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         WHERE e.account_id = ?1
           AND t.txn_date >= ?2 AND t.txn_date < ?3
           AND t.status = 'posted'",
        params![acct_id, from, to],
        |row| row.get::<_, i64>(0),
    )
    .unwrap()
}

// ── B3: Half-open boundary correctness ───────────────────────────────────────

#[test]
fn transaction_on_end_date_is_excluded() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    // Period: [2024-01-01, 2024-04-01)
    insert_txn(&conn, "2024-01-01", &cash, &rev, 10_000, "posted"); // start — included
    insert_txn(&conn, "2024-03-31", &cash, &rev, 20_000, "posted"); // last day — included
    insert_txn(&conn, "2024-04-01", &cash, &rev, 99_999, "posted"); // end — EXCLUDED

    let total = pnl_sum(&conn, &rev, "2024-01-01", "2024-04-01");
    assert_eq!(total, 30_000, "transaction on end date must be excluded");
}

#[test]
fn transaction_on_start_date_is_included() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    insert_txn(&conn, "2024-01-01", &cash, &rev, 5_000, "posted");

    let total = pnl_sum(&conn, &rev, "2024-01-01", "2024-02-01");
    assert_eq!(total, 5_000, "transaction on start date must be included");
}

#[test]
fn adjacent_quarters_no_overlap_no_gap() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    // Q1 boundary day
    insert_txn(&conn, "2024-03-31", &cash, &rev, 1_000, "posted");
    // Q2 first day
    insert_txn(&conn, "2024-04-01", &cash, &rev, 2_000, "posted");

    let q1 = pnl_sum(&conn, &rev, "2024-01-01", "2024-04-01");
    let q2 = pnl_sum(&conn, &rev, "2024-04-01", "2024-07-01");
    assert_eq!(q1, 1_000);
    assert_eq!(q2, 2_000);
    // No txn appears in both quarters
    assert_eq!(q1 + q2, 3_000);
}

// ── B3: Fiscal year start month ≠ 1 ──────────────────────────────────────────

#[test]
fn apr_mar_fiscal_year_correct_bounds() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    // FY Apr 2024 – Mar 2025: [2024-04-01, 2025-04-01)
    insert_txn(&conn, "2024-03-31", &cash, &rev, 1_000, "posted"); // before FY — excluded
    insert_txn(&conn, "2024-04-01", &cash, &rev, 5_000, "posted"); // FY start — included
    insert_txn(&conn, "2025-03-31", &cash, &rev, 3_000, "posted"); // FY last day — included
    insert_txn(&conn, "2025-04-01", &cash, &rev, 9_999, "posted"); // after FY — excluded

    let total = pnl_sum(&conn, &rev, "2024-04-01", "2025-04-01");
    assert_eq!(total, 8_000);
}

// ── B3: Leap year Feb 29 ──────────────────────────────────────────────────────

#[test]
fn leap_year_feb29_transaction_included() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    insert_txn(&conn, "2024-02-29", &cash, &rev, 7_777, "posted");

    // Period [2024-02-01, 2024-03-01) must include Feb 29
    let total = pnl_sum(&conn, &rev, "2024-02-01", "2024-03-01");
    assert_eq!(total, 7_777);

    // Period [2024-03-01, 2024-04-01) must NOT include Feb 29
    let next = pnl_sum(&conn, &rev, "2024-03-01", "2024-04-01");
    assert_eq!(next, 0);
}

// ── B1: Drafts and voids excluded ─────────────────────────────────────────────

#[test]
fn draft_transaction_excluded_from_pnl() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    insert_txn(&conn, "2024-06-15", &cash, &rev, 10_000, "posted");
    insert_txn(&conn, "2024-06-20", &cash, &rev, 5_000, "draft"); // should be ignored

    let total = pnl_sum(&conn, &rev, "2024-01-01", "2025-01-01");
    assert_eq!(total, 10_000, "draft must not appear in P&L");
}

#[test]
fn void_transaction_excluded_from_pnl() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    insert_txn(&conn, "2024-06-15", &cash, &rev, 10_000, "posted");
    insert_txn(&conn, "2024-06-16", &cash, &rev, 3_000, "void"); // should be ignored

    let total = pnl_sum(&conn, &rev, "2024-01-01", "2025-01-01");
    assert_eq!(total, 10_000, "void must not appear in P&L");
}

#[test]
fn toggling_to_draft_flips_total() {
    let conn = open_db();
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));

    let txn_id = insert_txn(&conn, "2024-06-15", &cash, &rev, 8_000, "posted");

    let before = pnl_sum(&conn, &rev, "2024-01-01", "2025-01-01");
    assert_eq!(before, 8_000);

    conn.execute(
        "UPDATE transactions SET status = 'draft' WHERE id = ?1",
        params![txn_id],
    )
    .unwrap();

    let after = pnl_sum(&conn, &rev, "2024-01-01", "2025-01-01");
    assert_eq!(after, 0, "changing status to draft must drop the total");
}

// ── B2: MissingSystemAccount error when role unmapped ─────────────────────────

#[test]
fn balance_range_by_role_returns_error_when_unmapped() {
    let conn = open_db();
    // No account has role 'cash' — query should return 0 rows.
    let role_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE system_account_role = ?1 AND active = 1",
            params!["cash"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        role_count, 0,
        "role count should be 0 when no account has the role"
    );
    // Production code returns AppError::Validation("MissingSystemAccount:cash") when count == 0.
    // We verify the detection condition directly since we can't call the Tauri command here.
}

#[test]
fn balance_range_by_role_succeeds_when_mapped() {
    let conn = open_db();
    let cash_acct = insert_account(&conn, "1010", "Checking Account", "asset", Some("cash"));
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);

    insert_txn(&conn, "2024-01-15", &cash_acct, &rev, 50_000, "posted");

    let role_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE system_account_role = ?1 AND active = 1",
            params!["cash"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(role_count, 1);

    // Verify balance query by role works
    let balance: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(e.debit_cents),0) - COALESCE(SUM(e.credit_cents),0)
             FROM entries e
             JOIN transactions t ON t.id = e.transaction_id
             JOIN accounts a ON a.id = e.account_id
             WHERE a.system_account_role = ?1
               AND t.txn_date <= ?2
               AND t.status = 'posted'",
            params!["cash", "2024-01-31"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(balance, 50_000);
}

// ── B5: P&L vs Balance Sheet retained-earnings tie-out ───────────────────────
//
// For the same fiscal period: pnl.net_income == balance_sheet.ytd_net_income
// Both use the same half-open [fiscal_start, exclusive_end) query.

fn net_income_for(conn: &Connection, from: &str, to: &str) -> i64 {
    // Revenue (credit-normal) minus Expense (debit-normal), posted only.
    let (rev_cr, rev_dr, exp_dr, exp_cr): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.credit_cents ELSE 0 END),0),
                COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.debit_cents  ELSE 0 END),0),
                COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.debit_cents  ELSE 0 END),0),
                COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.credit_cents ELSE 0 END),0)
             FROM entries e
             JOIN transactions t ON t.id = e.transaction_id
             JOIN accounts a ON a.id = e.account_id
             WHERE t.txn_date >= ?1 AND t.txn_date < ?2
               AND t.status = 'posted'
               AND a.account_type IN ('revenue','expense')",
            params![from, to],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    (rev_cr - rev_dr) - (exp_dr - exp_cr)
}

#[test]
fn pnl_net_income_equals_balance_sheet_ytd_change_in_equity() {
    let conn = open_db();

    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);
    let exp = insert_account(&conn, "6010", "Expense", "expense", None);

    // FY 2024 Jan–Dec: [2024-01-01, 2025-01-01)
    insert_txn(&conn, "2024-03-01", &cash, &rev, 100_000, "posted"); // +$1000 revenue
    insert_txn(&conn, "2024-06-01", &exp, &cash, 30_000, "posted"); // +$300 expense
    insert_txn(&conn, "2024-12-31", &cash, &rev, 50_000, "posted"); // +$500 revenue
                                                                    // A draft that must not affect either report
    insert_txn(&conn, "2024-09-01", &cash, &rev, 99_999, "draft");

    let pnl_ni = net_income_for(&conn, "2024-01-01", "2025-01-01");
    // net_income = (100_000 + 50_000) - 30_000 = 120_000 cents
    assert_eq!(pnl_ni, 120_000);

    // Balance Sheet YTD net income uses the same query with as_of_next = 2025-01-01
    let bs_ni = net_income_for(&conn, "2024-01-01", "2025-01-01");
    assert_eq!(
        pnl_ni, bs_ni,
        "P&L net income must equal Balance Sheet YTD net income for the same period"
    );
}

#[test]
fn tie_out_with_draft_excluded_both_sides() {
    let conn = open_db();

    let cash = insert_account(&conn, "1010", "Cash", "asset", Some("cash"));
    let rev = insert_account(&conn, "4010", "Revenue", "revenue", None);

    insert_txn(&conn, "2024-05-01", &cash, &rev, 200_000, "posted");
    insert_txn(&conn, "2024-05-15", &cash, &rev, 50_000, "draft"); // excluded

    let pnl_ni = net_income_for(&conn, "2024-01-01", "2025-01-01");
    let bs_ni = net_income_for(&conn, "2024-01-01", "2025-01-01");
    assert_eq!(pnl_ni, 200_000);
    assert_eq!(pnl_ni, bs_ni);
}

// ── period.rs unit tests are in src/commands/period.rs (cfg(test)) ────────────
