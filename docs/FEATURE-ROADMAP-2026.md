# Taxeasy Feature Roadmap 2026

**18 High-Value Features** — Organized by phase with dependencies, technical specs, and implementation order.

---

## Phase 1: Tax Compliance Foundation (Weeks 1-4)

### Feature 2: Schedule C Auto-Fill
**Priority:** CRITICAL | **Effort:** Medium | **Dependencies:** None

**What:** Map COA accounts to IRS Schedule C line items and auto-populate the form.

**Implementation:**
```
src-tauri/
├── src/
│   ├── reports/
│   │   └── schedule_c.rs       # NEW: Schedule C generator
│   └── domain/
│       └── coa_mapping.rs      # NEW: COA → Schedule C mappings
```

**Database Schema:**
```sql
-- Add to 002_client.sql or new migration 003_schedule_c.sql
CREATE TABLE coa_schedule_c_mappings (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    schedule_c_line TEXT NOT NULL,  -- e.g., "Line 1", "Line 6", "Line 9"
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

**Schedule C Line Mappings (Sole Prop/SMLLC):**
| Line | Description | COA Accounts |
|------|-------------|--------------|
| 1 | Gross Receipts | Income:Sales, Income:Service Revenue |
| 2 | Returns & Allowances | Income:Returns, Income:Refunds |
| 4 | Cost of Goods Sold | COGS:*, Expense:Materials |
| 6 | Other Income | Income:Other, Income:Interest |
| 8 | Advertising | Expense:Advertising |
| 9 | Car & Truck | Expense:Auto, Expense:Mileage |
| 10 | Commissions | Expense:Commissions |
| 12 | Depreciation | Expense:Depreciation |
| 16a | Interest & Mortgages | Expense:Interest |
| 17 | Legal & Professional | Expense:Legal, Expense:Accounting |
| 18 | Office Expense | Expense:Office, Expense:Supplies |
| 20a | Rent/Lease (Equipment) | Expense:Rent:Equipment |
| 20b | Rent/Lease (Other) | Expense:Rent:Office |
| 21 | Repairs & Maintenance | Expense:Repairs |
| 22 | Supplies & Materials | Expense:Supplies, Expense:Materials |
| 23 | Taxes & Licenses | Expense:Taxes, Expense:Licenses |
| 24a | Travel | Expense:Travel |
| 24b | Meals (50%) | Expense:Meals (auto-apply 50% limit) |
| 25 | Utilities | Expense:Utilities |
| 26 | Wages | Expense:Wages, Expense:Salaries |
| 27 | Employee Benefits | Expense:Benefits |
| 30 | Other Expenses | Expense:Other |

**Frontend:**
- New tab in Reports: "Schedule C"
- Table view: Line # | Description | Amount | Edit Mapping
- Export: PDF (IRS-compatible format) + CSV

**API Commands:**
```rust
#[tauri::command]
async fn generate_schedule_c(client_id: String, year: i32) -> Result<ScheduleCReport>

#[tauri::command]
async fn get_schedule_c_mappings(client_id: String) -> Result<Vec<CoaMapping>>

#[tauri::command]
async fn update_schedule_c_mapping(client_id: String, account_id: String, line: String) -> Result<()>
```

---

### Feature 3: 1099-NEC Generation
**Priority:** CRITICAL | **Effort:** Medium | **Dependencies:** Feature 2 (COA mappings)

**What:** Generate 1099-NEC forms for contractors paid $600+ in the tax year.

**Database Schema:**
```sql
CREATE TABLE vendors (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ein TEXT,
    ssn_encrypted TEXT,  -- AES-256-GCM encrypted SSN
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    phone TEXT,
    email TEXT,
    total_payments_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE contractor_payments (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

**Implementation:**
```
src-tauri/
├── src/
│   ├── commands/
│   │   └── vendor_commands.rs   # NEW
│   ├── domain/
│   │   └── vendor.rs            # NEW: Vendor domain type
│   └── reports/
│       └── form_1099.rs         # NEW: 1099-NEC generator
```

**1099-NEC Thresholds:**
- Box 1 (Nonemployee Compensation): $600+
- Box 2 (Cash received): Track if applicable
- Box 4 (Federal tax withheld): Backup withholding (24%)
- Box 5 (State tax withheld): Per state rules

**Frontend:**
- New "Vendors" page under Clients
- Vendor form: W-9 data capture (name, EIN/SSN, address)
- 1099-NEC preview before export
- Bulk generate all 1099s for year
- Export: PDF (IRS red copy format) + CSV (for e-filing)

**API Commands:**
```rust
#[tauri::command]
async fn create_vendor(client_id: String, vendor: CreateVendorPayload) -> Result<Vendor>

#[tauri::command]
async fn list_vendors(client_id: String) -> Result<Vec<Vendor>>

#[tauri::command]
async fn track_contractor_payment(vendor_id: String, transaction_id: String, amount_cents: i64) -> Result<()>

#[tauri::command]
async fn generate_1099_nec(vendor_id: String, year: i32) -> Result<Form1099Nec>

#[tauri::command]
async fn get_vendors_requiring_1099(client_id: String, year: i32) -> Result<Vec<Vendor>>
```

---

### Feature 5: IRS Mileage Rate Tracker
**Priority:** HIGH | **Effort:** Low | **Dependencies:** None

**What:** Track business miles and auto-calculate deductions using IRS rates.

**IRS Mileage Rates (per year):**
| Year | Rate |
|------|------|
| 2026 | 70¢ (projected) |
| 2025 | 65.5¢ |
| 2024 | 67¢ |
| 2023 | 65.5¢ |

**Database Schema:**
```sql
CREATE TABLE mileage_logs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    date TEXT NOT NULL,
    purpose TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    miles_real REAL NOT NULL,
    rate_cents INTEGER NOT NULL,  -- IRS rate for that year
    deduction_cents INTEGER GENERATED ALWAYS AS (miles_real * rate_cents / 100) STORED,
    notes TEXT,
    receipt_image_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**Frontend:**
- New "Mileage" page under each client
- Quick-add form: Date, Purpose, Origin→Dest, Miles
- Map integration (optional): Auto-calculate distance
- Monthly/yearly summary with deduction totals
- Export: PDF log (IRS audit-ready) + CSV

**API Commands:**
```rust
#[tauri::command]
async fn create_mileage_log(client_id: String, log: CreateMileagePayload) -> Result<MileageLog>

#[tauri::command]
async fn list_mileage_logs(client_id: String, year: i32) -> Result<Vec<MileageLog>>

#[tauri::command]
async fn get_mileage_deduction_total(client_id: String, year: i32) -> Result<i64>

#[tauri::command]
async fn get_irs_mileage_rate(year: i32) -> Result<i32>  // Built-in rates
```

---

## Phase 2: Banking Integration (Weeks 5-10)

### Feature 6: Bank Feeds (Plaid)
**Priority:** CRITICAL | **Effort:** High | **Dependencies:** None

**What:** Auto-import transactions from connected bank accounts via Plaid.

**Architecture:**
```
src-tauri/
├── src/
│   ├── commands/
│   │   └── plaid_commands.rs    # NEW: Plaid integration
│   ├── domain/
│   │   └── bank_connection.rs   # NEW: Bank connection state
│   └── services/
│       └── plaid_service.rs     # NEW: Plaid API wrapper
```

**Database Schema:**
```sql
CREATE TABLE bank_connections (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    plaid_item_id TEXT NOT NULL,
    plaid_access_token_encrypted TEXT NOT NULL,  -- AES-256-GCM
    institution_name TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    account_mask TEXT,  -- Last 4 digits
    account_official_name TEXT,
    account_type TEXT,  -- depository, credit, loan, etc.
    account_subtype TEXT,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL,  -- active, inactive, error
    last_sync_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE imported_transactions (
    id TEXT PRIMARY KEY,
    bank_connection_id TEXT NOT NULL,
    plaid_transaction_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    date TEXT NOT NULL,
    pending BOOLEAN DEFAULT FALSE,
    merchant_name TEXT,
    category TEXT,  -- Plaid category
    category_id TEXT,
    matched_ledger_entry_id TEXT,  -- Link to transactions.id
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bank_connection_id) REFERENCES bank_connections(id),
    FOREIGN KEY (matched_ledger_entry_id) REFERENCES transactions(id)
);
```

**Plaid Setup:**
1. Get Plaid API keys (https://plaid.com)
2. Add to `src-tauri/.env`:
   ```
   PLAID_CLIENT_ID=xxx
   PLAID_SECRET=xxx
   PLAID_ENV=sandbox  # or production
   ```
3. Add to `Cargo.toml`:
   ```toml
   [dependencies]
   plaid = "0.12"
   reqwest = { version = "0.11", features = ["json"] }
   ```

**Frontend:**
- New "Banking" page under each client
- "Connect Bank" button → Plaid Link modal
- List connected accounts with sync status
- Transaction feed: Plaid transactions on left, ledger matches on right
- One-click match/create

**API Commands:**
```rust
#[tauri::command]
async fn create_plaid_link_token(client_id: String) -> Result<String>

#[tauri::command]
async fn exchange_plaid_public_token(client_id: String, public_token: String) -> Result<BankConnection>

#[tauri::command]
async fn sync_bank_transactions(connection_id: String) -> Result<SyncResult>

#[tauri::command]
async fn list_bank_connections(client_id: String) -> Result<Vec<BankConnection>>

#[tauri::command]
async fn list_imported_transactions(connection_id: String) -> Result<Vec<ImportedTransaction>>

#[tauri::command]
async fn match_transaction(imported_id: String, ledger_transaction_id: String) -> Result<()>
```

---

### Feature 7: Bank Reconciliation
**Priority:** CRITICAL | **Effort:** Medium | **Dependencies:** Feature 6

**What:** Match ledger entries to bank statement lines, track reconciled status.

**Database Schema:**
```sql
CREATE TABLE reconciliations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    statement_start_date TEXT NOT NULL,
    statement_end_date TEXT NOT NULL,
    statement_start_balance_cents INTEGER NOT NULL,
    statement_end_balance_cents INTEGER NOT NULL,
    reconciled_at TEXT,
    reconciled_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE reconciliation_items (
    id TEXT PRIMARY KEY,
    reconciliation_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    cleared BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Add to transactions table
ALTER TABLE transactions ADD COLUMN reconciled BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN reconciliation_id TEXT REFERENCES reconciliations(id);
```

**Frontend:**
- Reconciliation wizard:
  1. Enter statement dates & balances
  2. Show unreconciled transactions
  3. Check off cleared items
  4. Show difference (should be $0)
  5. Complete → lock transactions

**API Commands:**
```rust
#[tauri::command]
async fn start_reconciliation(client_id: String, account_id: String, start_date: String, end_date: String, start_balance: i64, end_balance: i64) -> Result<Reconciliation>

#[tauri::command]
async fn mark_cleared(transaction_id: String, cleared: bool) -> Result<()>

#[tauri::command]
async fn complete_reconciliation(reconciliation_id: String) -> Result<()>

#[tauri::command]
async fn get_reconciliation_status(account_id: String) -> Result<Option<ReconciliationStatus>>
```

---

### Feature 8: Credit Card Reconciliation
**Priority:** HIGH | **Effort:** Low | **Dependencies:** Feature 7

**What:** Same as bank rec but optimized for credit card statements.

**Differences from Bank Rec:**
- Statement balance is amount OWED (liability)
- Payments reduce balance, charges increase
- Interest/fees need special handling

**Frontend:**
- Same wizard as bank rec
- Add "Add Interest/Fee" button during reconciliation
- Show credit utilization % if limit is set

**Database:**
```sql
ALTER TABLE bank_connections ADD COLUMN credit_limit_cents INTEGER;
ALTER TABLE reconciliations ADD COLUMN interest_amount_cents INTEGER DEFAULT 0;
ALTER TABLE reconciliations ADD COLUMN fee_amount_cents INTEGER DEFAULT 0;
```

---

### Feature 9: Payment Processing Integration
**Priority:** HIGH | **Effort:** Medium | **Dependencies:** Feature 10 (Invoices)

**What:** Accept payments via Stripe/PayPal, auto-record in ledger.

**Stripe Implementation:**
```rust
// src-tauri/src/services/stripe_service.rs
pub struct StripeService {
    client: stripe::Client,
}

impl StripeService {
    pub async fn create_payment_link(&self, invoice_id: String, amount_cents: i64) -> Result<String>;
    pub async fn handle_webhook(&self, payload: String, sig: String) -> Result<PaymentEvent>;
}
```

**Database:**
```sql
CREATE TABLE payment_integrations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    provider TEXT NOT NULL,  -- 'stripe' | 'paypal'
    account_id_encrypted TEXT NOT NULL,
    webhook_secret_encrypted TEXT,
    status TEXT NOT NULL,  -- active, inactive
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT,
    client_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    fee_cents INTEGER NOT NULL,  -- Stripe/PayPal fee
    net_cents INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    status TEXT NOT NULL,  -- pending, completed, failed, refunded
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**Frontend:**
- Settings → Payment Integrations
- "Connect Stripe" / "Connect PayPal" OAuth flow
- Invoice form: "Include payment link" checkbox
- Payment tracking: Record fees automatically

**API Commands:**
```rust
#[tauri::command]
async fn connect_stripe(client_id: String, auth_code: String) -> Result<PaymentIntegration>

#[tauri::command]
async fn create_payment_link(invoice_id: String) -> Result<String>

#[tauri::command]
async fn handle_stripe_webhook(client_id: String, payload: String, sig: String) -> Result<()>

#[tauri::command]
async fn record_payment(invoice_id: String, amount_cents: i64, fee_cents: i64, provider: String) -> Result<Payment>
```

---

## Phase 3: Automation (Weeks 11-14)

### Feature 10: Recurring Transactions
**Priority:** HIGH | **Effort:** Medium | **Dependencies:** None

**What:** Auto-create recurring invoices, bills, and journal entries.

**Database:**
```sql
CREATE TABLE recurring_transactions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'invoice', 'bill', 'journal_entry'
    frequency TEXT NOT NULL,  -- 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
    start_date TEXT NOT NULL,
    end_date TEXT,  -- NULL = indefinite
    last_run_date TEXT,
    next_run_date TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    auto_post BOOLEAN DEFAULT FALSE,  -- Auto-post vs. draft
    template_data JSON NOT NULL,  -- Serialized transaction data
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE recurring_run_history (
    id TEXT PRIMARY KEY,
    recurring_transaction_id TEXT NOT NULL,
    run_date TEXT NOT NULL,
    result_transaction_id TEXT,
    status TEXT NOT NULL,  -- 'success', 'failed', 'skipped'
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recurring_transaction_id) REFERENCES recurring_transactions(id)
);
```

**Frontend:**
- New "Recurring" page under Transactions
- "Create Recurring Template" from any transaction
- Calendar view of upcoming recurring items
- Manual "Run Now" option

**API Commands:**
```rust
#[tauri::command]
async fn create_recurring_template(client_id: String, template: CreateRecurringPayload) -> Result<RecurringTransaction>

#[tauri::command]
async fn list_recurring_templates(client_id: String) -> Result<Vec<RecurringTransaction>>

#[tauri::command]
async fn run_recurring_template(template_id: String) -> Result<String>  // Returns created transaction ID

#[tauri::command]
async fn get_upcoming_recurring(client_id: String, days: i32) -> Result<Vec<RecurringTransaction>>
```

**Scheduler:**
- Daily background job checks `next_run_date`
- Auto-creates transactions for due templates
- Logs run history

---

### Feature 11: Auto-Reconciliation Rules
**Priority:** HIGH | **Effort:** Low | **Dependencies:** Feature 6 (Bank Feeds)

**What:** "Always categorize Starbucks as Meals & Entertainment"

**Database:**
```sql
CREATE TABLE auto_reconcile_rules (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    condition_type TEXT NOT NULL,  -- 'merchant_contains', 'amount_equals', 'category_matches'
    condition_value TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- 'set_account', 'set_category', 'set_payee'
    action_value TEXT NOT NULL,
    priority INTEGER DEFAULT 0,  -- Higher = runs first
    is_active BOOLEAN DEFAULT TRUE,
    match_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**Frontend:**
- Settings → Auto-Reconcile Rules
- Rule builder: "When merchant contains ___ → set category to ___"
- Suggest rules from past manual matches
- Test rule against imported transactions

**API Commands:**
```rust
#[tauri::command]
async fn create_auto_rule(client_id: String, rule: CreateRulePayload) -> Result<AutoRule>

#[tauri::command]
async fn apply_auto_rules(client_id: String, imported_transaction_id: String) -> Result<AppliedRules>

#[tauri::command]
async fn suggest_rules_from_history(client_id: String, merchant: String) -> Result<Vec<RuleSuggestion>>
```

---

### Feature 12: Bill Reminders
**Priority:** MEDIUM | **Effort:** Low | **Dependencies:** None

**What:** Due date alerts for recurring bills.

**Database:**
```sql
CREATE TABLE bills (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    payee_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    due_day_of_month INTEGER,  -- 1-31
    frequency TEXT DEFAULT 'monthly',
    account_id TEXT,  -- Which account to pay from
    category_account_id TEXT,  -- Expense category
    last_paid_date TEXT,
    next_due_date TEXT NOT NULL,
    reminder_days_before INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE bill_reminders (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    reminder_date TEXT NOT NULL,
    sent_at TEXT,
    status TEXT DEFAULT 'pending',  -- pending, sent, dismissed
    FOREIGN KEY (bill_id) REFERENCES bills(id)
);
```

**Frontend:**
- Dashboard widget: "Upcoming Bills"
- Bills page: List, add, edit
- In-app notification center
- Optional email reminders

**API Commands:**
```rust
#[tauri::command]
async fn create_bill(client_id: String, bill: CreateBillPayload) -> Result<Bill>

#[tauri::command]
async fn list_bills(client_id: String) -> Result<Vec<Bill>>

#[tauri::command]
async fn mark_bill_paid(bill_id: String, transaction_id: String) -> Result<()>

#[tauri::command]
async fn get_upcoming_bills(client_id: String, days: i32) -> Result<Vec<Bill>>
```

---

### Feature 13: Late Payment Reminders
**Priority:** MEDIUM | **Effort:** Low | **Dependencies:** Feature 9 (Payments)

**What:** Auto-email for overdue invoices.

**Database:**
```sql
ALTER TABLE invoices ADD COLUMN reminder_sent_count INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_reminder_date TEXT;
ALTER TABLE invoices ADD COLUMN auto_reminder_enabled BOOLEAN DEFAULT FALSE;

CREATE TABLE reminder_templates (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    delay_days INTEGER NOT NULL,  -- Days after due date
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**Frontend:**
- Invoice settings: Enable auto-reminders
- Template editor: Subject/body with variables {{customer_name}}, {{amount}}, {{due_date}}
- Schedule: Send at 3, 7, 14, 30 days overdue

**API Commands:**
```rust
#[tauri::command]
async fn send_late_reminder(invoice_id: String, template_id: String) -> Result<()>

#[tauri::command]
async fn schedule_auto_reminders(invoice_id: String, template_ids: Vec<String>) -> Result<()>

#[tauri::command]
async fn get_overdue_invoices(client_id: String) -> Result<Vec<Invoice>>
```

---

## Phase 4: Advanced Reporting (Weeks 15-20)

### Feature 15: Budget vs. Actual
**Priority:** MEDIUM | **Effort:** Medium | **Dependencies:** None

**What:** Compare actuals to budgeted amounts by category.

**Database:**
```sql
CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE budget_lines (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    month_01_cents INTEGER DEFAULT 0,
    month_02_cents INTEGER DEFAULT 0,
    -- ... through month_12
    month_12_cents INTEGER DEFAULT 0,
    FOREIGN KEY (budget_id) REFERENCES budgets(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

**Frontend:**
- Budgets page: Create/edit annual budget
- Report view: Account | Budget | Actual | Variance | %
- Variance highlighting (red = over budget)

**API Commands:**
```rust
#[tauri::command]
async fn create_budget(client_id: String, year: i32) -> Result<Budget>

#[tauri::command]
async fn update_budget_lines(budget_id: String, lines: Vec<BudgetLinePayload>) -> Result<()>

#[tauri::command]
async fn get_budget_vs_actual(client_id: String, budget_id: String, month: i32) -> Result<BudgetReport>
```

---

### Feature 16: Aging Reports (AR/AP)
**Priority:** HIGH | **Effort:** Medium | **Dependencies:** Feature 10 (Invoices), Bills

**What:** Accounts Receivable/Payable aging (30/60/90 days).

**Database:**
```sql
-- Views for aging buckets
CREATE VIEW ar_aging AS
SELECT
    invoice_id,
    customer_id,
    amount_cents,
    amount_paid_cents,
    amount_due_cents,
    due_date,
    CASE
        WHEN julianday('now') - julianday(due_date) <= 30 THEN 'current'
        WHEN julianday('now') - julianday(due_date) <= 60 THEN '30-60'
        WHEN julianday('now') - julianday(due_date) <= 90 THEN '60-90'
        ELSE '90+'
    END as aging_bucket
FROM invoices
WHERE amount_due_cents > 0;
```

**Frontend:**
- Aging report: Customer | Current | 30-60 | 60-90 | 90+ | Total
- Drill-down to individual invoices
- "Contact" button for overdue accounts

**API Commands:**
```rust
#[tauri::command]
async fn get_ar_aging(client_id: String, as_of_date: String) -> Result<AgingReport>

#[tauri::command]
async fn get_ap_aging(client_id: String, as_of_date: String) -> Result<AgingReport>
```

---

### Feature 17: Cash Flow Forecast
**Priority:** MEDIUM | **Effort:** High | **Dependencies:** Feature 10, 12, 16

**What:** Predict cash position 30/60/90 days out.

**Forecasting Logic:**
1. Start with current bank balances
2. Add: Expected AR collections (based on payment history)
3. Subtract: Expected AP payments (based on due dates)
4. Add: Recurring income (Feature 10)
5. Subtract: Recurring expenses (Feature 10, 12)

**Frontend:**
- Graph: Cash position over time (line chart)
- Table: Date | In | Out | Net | Balance
- Scenario planning: "What if we collect 50% of AR?"

**API Commands:**
```rust
#[tauri::command]
async fn forecast_cash_flow(client_id: String, days: i32, assumptions: ForecastAssumptions) -> Result<CashFlowForecast>
```

---

### Feature 18: Tax Liability Dashboard
**Priority:** HIGH | **Effort:** Medium | **Dependencies:** Feature 2 (Schedule C)

**What:** Real-time view of owed taxes.

**Tax Calculations:**
```rust
// src-tauri/src/reports/tax_liability.rs
pub fn calculate_self_employment_tax(net_profit: i64) -> i64 {
    // 2026: 15.3% on first $168,600, 2.9% above
    let threshold = 16860000; // cents
    if net_profit <= threshold {
        net_profit * 153 / 1000
    } else {
        threshold * 153 / 1000 + (net_profit - threshold) * 29 / 1000
    }
}

pub fn calculate_income_tax(taxable_income: i64, filing_status: FilingStatus) -> i64 {
    // 2026 tax brackets...
}

pub fn calculate_sales_tax(taxable_sales: i64, jurisdiction: &str) -> i64 {
    // Per-jurisdiction rates
}
```

**Frontend:**
- Dashboard widget: Tax Liability summary
- Breakdown: Federal Income | Self-Employment | State | Sales Tax
- Quarterly payment tracker
- "Pay Now" links to IRS EFTPS

**API Commands:**
```rust
#[tauri::command]
async fn get_tax_liability_summary(client_id: String, year: i32) -> Result<TaxLiabilitySummary>

#[tauri::command]
async fn calculate_quarterly_estimate(client_id: String, quarter: i32, year: i32) -> Result<QuarterlyEstimate>
```

---

## Phase 5: Collaboration (Weeks 21-24)

### Feature 23: Client Document Requests
**Priority:** MEDIUM | **Effort:** Medium | **Dependencies:** Feature 14 (Documents)

**What:** Request missing docs from clients.

**Database:**
```sql
CREATE TABLE document_requests (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    request_type TEXT NOT NULL,  -- 'receipt', 'invoice_info', 'statement', 'other'
    description TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pending',  -- pending, fulfilled, expired
    fulfilled_at TEXT,
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE request_notifications (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,  -- 'email', 'sms', 'in_app'
    recipient_email TEXT,
    recipient_phone TEXT,
    sent_at TEXT,
    opened_at TEXT,
    FOREIGN KEY (request_id) REFERENCES document_requests(id)
);
```

**Frontend:**
- Document Requests page
- Create request → send email/SMS to client
- Client portal link to upload
- Track fulfillment status

**API Commands:**
```rust
#[tauri::command]
async fn create_document_request(client_id: String, request: CreateRequestPayload) -> Result<DocumentRequest>

#[tauri::command]
async fn send_request_notification(request_id: String) -> Result<()>

#[tauri::command]
async fn fulfill_request(request_id: String, document_ids: Vec<String>) -> Result<()>
```

---

## Phase 6: Invoice Enhancements (Weeks 25-26)

### Feature 25: Recurring Invoice Templates
**Priority:** MEDIUM | **Effort:** Low | **Dependencies:** Feature 10

**What:** Save invoice layouts for reuse.

**Database:**
```sql
CREATE TABLE invoice_templates (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    logo_path TEXT,
    primary_color TEXT DEFAULT '#2563EB',
    footer_text TEXT,
    payment_terms_days INTEGER DEFAULT 30,
    default_line_items JSON,  -- [{description, amount, account_id}]
    tax_rate REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

**Frontend:**
- Invoice Settings → Templates
- Template preview
- "Apply Template" when creating invoice

**API Commands:**
```rust
#[tauri::command]
async fn create_invoice_template(client_id: String, template: CreateTemplatePayload) -> Result<InvoiceTemplate>

#[tauri::command]
async fn apply_template_to_invoice(invoice_id: String, template_id: String) -> Result<()>
```

---

### Feature 27: Payment Link in Invoices
**Priority:** HIGH | **Effort:** Low | **Dependencies:** Feature 9

**What:** Stripe/PayPal payment buttons on invoices.

**Frontend:**
- Invoice PDF: "Pay Now" button
- Email invoice: Embedded payment link
- Payment page: Branded, shows invoice details

**Implementation:**
- Use Feature 9's `create_payment_link` command
- Add to invoice PDF template
- Track clicks/conversions

---

## Phase 7: Analytics (Weeks 27-28)

### Feature 29: Financial Health Score
**Priority:** LOW | **Effort:** Medium | **Dependencies:** Feature 17, 18

**What:** Simple score based on cash flow, debt, profitability.

**Scoring Model:**
```rust
// src-tauri/src/reports/health_score.rs
pub fn calculate_health_score(client_id: String) -> HealthScore {
    let mut score = 0;
    let mut factors = Vec::new();

    // Cash runway (0-25 points)
    let runway_months = get_cash_runway_months(client_id);
    if runway_months >= 6 { score += 25; }
    else if runway_months >= 3 { score += 15; }
    else if runway_months >= 1 { score += 5; }
    factors.push(HealthFactor::CashRunway { months: runway_months });

    // Profit margin (0-25 points)
    let margin = get_net_profit_margin(client_id);
    if margin >= 0.20 { score += 25; }
    else if margin >= 0.10 { score += 15; }
    else if margin >= 0 { score += 5; }
    factors.push(HealthFactor::ProfitMargin { margin });

    // AR collection speed (0-25 points)
    let dso = get_days_sales_outstanding(client_id);
    if dso <= 30 { score += 25; }
    else if dso <= 45 { score += 15; }
    else if dso <= 60 { score += 5; }
    factors.push(HealthFactor::CollectionSpeed { dso });

    // Debt ratio (0-25 points)
    let debt_ratio = get_debt_to_equity_ratio(client_id);
    if debt_ratio <= 0.5 { score += 25; }
    else if debt_ratio <= 1.0 { score += 15; }
    else if debt_ratio <= 2.0 { score += 5; }
    factors.push(HealthFactor::DebtRatio { ratio: debt_ratio });

    HealthScore { score, factors }
}
```

**Frontend:**
- Dashboard widget: Score gauge (0-100)
- Breakdown: Cash | Profit | Collections | Debt
- Recommendations: "Improve collections to boost score"

**API Commands:**
```rust
#[tauri::command]
async fn get_financial_health_score(client_id: String) -> Result<HealthScore>

#[tauri::command]
async fn get_health_recommendations(client_id: String) -> Result<Vec<Recommendation>>
```

---

## Implementation Priority Summary

| Phase | Features | Total Effort |
|-------|----------|--------------|
| 1 | 2, 3, 5 | 3 weeks |
| 2 | 6, 7, 8, 9 | 6 weeks |
| 3 | 10, 11, 12, 13 | 4 weeks |
| 4 | 15, 16, 17, 18 | 6 weeks |
| 5 | 23 | 3 weeks |
| 6 | 25, 27 | 2 weeks |
| 7 | 29 | 2 weeks |

**Total: ~26 weeks (6 months)**

---

## Next Steps

1. **Start with Phase 1** — Tax compliance is the core value prop
2. **Plaid setup** — Apply for Plaid developer account early (approval takes time)
3. **Stripe setup** — Create Stripe Connect account for payment processing
4. **UI component library** — Consider shadcn/ui for consistent components
