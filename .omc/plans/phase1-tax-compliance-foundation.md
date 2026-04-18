# Phase 1: Tax Compliance Foundation - Implementation Plan

**Created:** 2026-04-17  
**Phase Duration:** 3-4 weeks  
**Features:** Schedule C Auto-Fill (Feature 2), 1099-NEC Generation (Feature 3), IRS Mileage Rate Tracker (Feature 5)

---

## Executive Summary

Phase 1 delivers the core tax compliance features that differentiate Taxeasy from generic bookkeeping tools. These features make the app "IRS-ready" out of the box.

### Implementation Order

1. **Feature 5 (Mileage Tracker)** - Independent, simplest feature, builds confidence
2. **Feature 2 (Schedule C)** - Core tax feature, depends on existing COA structure
3. **Feature 3 (1099-NEC)** - Most complex, depends on Feature 2 patterns

### Dependencies Map

```
Feature 5 (Mileage) ──────────────► Independent
Feature 2 (Schedule C) ───────────► Uses existing COA accounts table
Feature 3 (1099-NEC) ──depends-on─► Feature 2 (COA mapping patterns)
```

---

## Feature 5: IRS Mileage Rate Tracker

**Priority:** HIGH | **Effort:** 4-6 hours | **Risk:** LOW

### What We're Building

Track business mileage with IRS standard rate auto-detection by date.

### Database Migration (011_mileage.sql)

**File:** `src-tauri/migrations/011_mileage.sql`

```sql
-- IRS mileage rates reference table
CREATE TABLE irs_mileage_rates (
    year           INTEGER PRIMARY KEY,
    rate_cents     INTEGER NOT NULL,  -- e.g., 6550 = 65.5 cents
    effective_date TEXT NOT NULL,     -- YYYY-MM-DD
    notes          TEXT
);

-- Pre-populate with known rates
INSERT INTO irs_mileage_rates (year, rate_cents, effective_date, notes) VALUES
    (2023, 6550, '2023-01-01', '65.5 cents/mile'),
    (2024, 6700, '2024-01-01', '67 cents/mile'),
    (2025, 6550, '2025-01-01', '65.5 cents/mile'),
    (2026, 7000, '2026-01-01', '70 cents/mile projected');

-- Mileage logs
CREATE TABLE mileage_logs (
    id             TEXT PRIMARY KEY,
    client_id      TEXT NOT NULL,
    date           TEXT NOT NULL,
    purpose        TEXT NOT NULL,
    origin         TEXT NOT NULL,
    destination    TEXT NOT NULL,
    miles_real     REAL NOT NULL,
    rate_cents     INTEGER NOT NULL,
    deduction_cents INTEGER NOT NULL,  -- Computed: miles * rate / 100
    notes          TEXT,
    receipt_image_path TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX idx_mileage_date ON mileage_logs(date);
CREATE INDEX idx_mileage_client ON mileage_logs(client_id);
```

### Rust Domain Model

**File:** `src-tauri/src/domain/mileage_log.rs` (NEW)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageLog {
    pub id: String,
    pub client_id: String,
    pub date: String,  // ISO-8601 "YYYY-MM-DD"
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub rate_cents: i64,
    pub deduction_cents: i64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMileagePayload {
    pub date: String,
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MileageRate {
    pub year: i32,
    pub rate_cents: i64,
    pub effective_date: String,
}
```

### Rust Commands

**File:** `src-tauri/src/commands/mileage.rs` (NEW)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `create_mileage_log` | client_id, payload | MileageLog | Create new log with auto rate |
| `list_mileage_logs` | client_id, year | Vec<MileageLog> | List logs for year |
| `delete_mileage_log` | log_id | () | Delete a log |
| `get_irs_mileage_rate` | year | MileageRate | Get IRS rate for year |
| `get_mileage_deduction_total` | client_id, year | i64 | Total deduction in cents |

**Key Implementation Details:**

```rust
// Auto-detect rate by date
fn get_rate_for_date(conn: &rusqlite::Connection, date: &str) -> Result<i64> {
    let year: i32 = date[..4].parse().map_err(|_| AppError::Validation(...))?;
    let row = conn.query_row(
        "SELECT rate_cents FROM irs_mileage_rates WHERE year = ?1",
        [year],
        |row| row.get::<_, i64>(0),
    );
    row.map_err(|_| AppError::NotFound(format!("No IRS rate for year {year}")))
}
```

### Frontend Component

**File:** `src/features/mileage/MileagePage.tsx` (NEW)

**Sub-components:**
- `src/features/mileage/MileageLogForm.tsx` - Add/edit form
- `src/features/mileage/MileageLogTable.tsx` - List view
- `src/features/mileage/MileageSummary.tsx` - Yearly totals card
- `src/lib/mileage-api.ts` - Tauri API wrapper

**UI Requirements:**
- Date picker with year navigation
- Origin → Destination text fields
- Miles input (decimal allowed)
- Auto-display: "At 70¢/mile = $XX.XX deduction"
- Export buttons: PDF (IRS log format), CSV

**Effort Breakdown:**
- Database migration: 0.5h
- Rust domain + commands: 2h
- Frontend components: 2-3h
- Tests: 1h

---

## Feature 2: Schedule C Auto-Fill

**Priority:** CRITICAL | **Effort:** 8-12 hours | **Risk:** MEDIUM

### What We're Building

Map COA accounts to IRS Schedule C line items and auto-populate the form from ledger data.

### Database Migration (012_schedule_c.sql)

**File:** `src-tauri/migrations/012_schedule_c.sql` (NEW)

```sql
-- COA to Schedule C line mappings (per-client overrides allowed)
CREATE TABLE coa_schedule_c_mappings (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    schedule_c_line TEXT NOT NULL,  -- e.g., "line_1", "line_8", "line_24b"
    is_custom       INTEGER DEFAULT 0,  -- 1 = client override, 0 = default
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE(client_id, account_id)
);

CREATE INDEX idx_schedule_c_account ON coa_schedule_c_mappings(account_id);

-- Default mappings seeded at migration time (for sole_prop entity type)
-- These are inserted into coa_schedule_c_mappings with client_id = 'DEFAULT'
-- and copied to new clients on creation
```

**Default Mapping Seed Data:**

| COA Pattern | Schedule C Line | Description |
|-------------|-----------------|-------------|
| Income:Sales | Line 1 | Gross Receipts |
| Income:Returns | Line 2 | Returns & Allowances |
| COGS:* | Line 4 | Cost of Goods Sold |
| Income:Other | Line 6 | Other Income |
| Expense:Advertising | Line 8 | Advertising |
| Expense:Auto | Line 9 | Car & Truck |
| Expense:Commissions | Line 10 | Commissions |
| Expense:Depreciation | Line 12 | Depreciation |
| Expense:Interest | Line 16a | Interest & Mortgages |
| Expense:Legal, Expense:Accounting | Line 17 | Legal & Professional |
| Expense:Office, Expense:Supplies | Line 18 | Office Expense |
| Expense:Rent:Equipment | Line 20a | Rent/Lease (Equipment) |
| Expense:Rent:Office | Line 20b | Rent/Lease (Other) |
| Expense:Repairs | Line 21 | Repairs & Maintenance |
| Expense:Supplies, Expense:Materials | Line 22 | Supplies & Materials |
| Expense:Taxes, Expense:Licenses | Line 23 | Taxes & Licenses |
| Expense:Travel | Line 24a | Travel |
| Expense:Meals | Line 24b | Meals (50% limit applied) |
| Expense:Utilities | Line 25 | Utilities |
| Expense:Wages, Expense:Salaries | Line 26 | Wages |
| Expense:Benefits | Line 27 | Employee Benefits |
| Expense:Other | Line 30 | Other Expenses |

### Rust Domain Model

**File:** `src-tauri/src/domain/schedule_c.rs` (NEW)

```rust
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCMapping {
    pub id: String,
    pub client_id: String,
    pub account_id: String,
    pub account_name: String,  // Joined from accounts
    pub schedule_c_line: String,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCLineItem {
    pub line_number: String,  // "1", "2", "4", etc.
    pub description: String,
    pub amount: Decimal,
    pub account_breakdown: Vec<AccountBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountBreakdown {
    pub account_id: String,
    pub account_name: String,
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct ScheduleCReport {
    pub client_id: String,
    pub tax_year: i32,
    pub business_name: String,
    pub lines: Vec<ScheduleCLineItem>,
    // Computed totals
    pub gross_income: Decimal,       // Line 7
    pub total_cogs: Decimal,         // Line 5
    pub gross_profit: Decimal,       // Line 6
    pub total_expenses: Decimal,     // Line 28
    pub net_profit: Decimal,         // Line 31
}

#[derive(Debug, Deserialize)]
pub struct UpdateMappingPayload {
    pub schedule_c_line: String,
}
```

### Rust Commands

**File:** `src-tauri/src/commands/schedule_c.rs` (NEW)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `generate_schedule_c` | client_id, year | ScheduleCReport | Generate full report |
| `get_schedule_c_mappings` | client_id | Vec<ScheduleCMapping> | List all mappings |
| `update_schedule_c_mapping` | account_id, payload | ScheduleCMapping | Update mapping |
| `reset_schedule_c_mappings` | client_id | () | Reset to defaults |
| `export_schedule_c_pdf` | client_id, year | String | Returns PDF path |
| `export_schedule_c_csv` | client_id, year | String | Returns CSV path |

**Key Implementation Details:**

```rust
// Compute Schedule C line amounts from ledger
fn compute_schedule_c_lines(
    conn: &rusqlite::Connection,
    client_id: &str,
    year: i32,
) -> Result<Vec<ScheduleCLineItem>> {
    let date_from = format!("{year}-01-01");
    let date_to = format!("{}-01-01", year + 1);

    // Query joins: accounts → coa_schedule_c_mappings → entries → transactions
    // Groups by schedule_c_line, sums debit/credit based on account_type
}

// Apply 50% limit to meals (Line 24b)
fn apply_meals_limit(amount: Decimal) -> Decimal {
    amount * Decimal::from(50) / Decimal::from(100)
}
```

### Report Generator

**File:** `src-tauri/src/reports/schedule_c.rs` (NEW)

Exports:
- PDF: IRS Schedule C form layout (using `printpdf` or `pdf_writer`)
- CSV: Line-by-line export for tax preparers

**PDF Layout:**
```
Schedule C (Form 1040)
Profit or Loss From Business

Part I: Income
  Line 1: Gross receipts ........... $XX,XXX
  Line 2: Returns/allowances ....... $X,XXX
  Line 3: [blank]
  Line 4: Cost of goods sold ....... $X,XXX
  Line 5: Gross profit (Line 4 sub Line 3) ...
  ...
Part II: Expenses
  Line 8: Advertising .............. $XXX
  Line 9: Car and truck ............ $XXX
  ...
```

### Frontend Component

**File:** `src/features/reports/ScheduleCPage.tsx` (NEW)

**Sub-components:**
- `src/features/reports/ScheduleCReport.tsx` - Read-only report view
- `src/features/reports/ScheduleCMappingEditor.tsx` - Editable mapping table
- `src/features/reports/ScheduleCExportButtons.tsx` - PDF/CSV export

**UI Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Schedule C - Tax Year 2026                    [▼]   │
├─────────────────────────────────────────────────────┤
│ [Edit Mappings] [Export PDF] [Export CSV]           │
├─────────────────────────────────────────────────────┤
│ Part I: Income                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ Line 1 - Gross Receipts          $125,000    │   │
│ │ Line 2 - Returns & Allowances    $  2,500    │   │
│ │ Line 4 - Cost of Goods Sold      $ 15,000    │   │
│ │ Line 6 - Other Income            $  1,200    │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ Part II: Expenses                                   │
│ ┌──────────────────────────────────────────────┐   │
│ │ Line 8  - Advertising            $  3,500    │   │
│ │ Line 9  - Car & Truck            $  4,200    │   │
│ │ Line 17 - Legal & Professional   $  2,000    │   │
│ │ Line 18 - Office Expense         $  1,800    │   │
│ │ Line 24b - Meals (50%)           $    450    │   │
│ │ ...                                           │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ Net Profit (Line 31): $XX,XXX                       │
└─────────────────────────────────────────────────────┘
```

**Mapping Editor Table:**
| Account | Current Line | Change To | Action |
|---------|--------------|-----------|--------|
| Income:Sales | Line 1 | [dropdown] | [Save] |
| Expense:Meals | Line 24b | [dropdown] | [Save] |

**Effort Breakdown:**
- Database migration: 1h
- Rust domain + commands: 4h
- Report generator (PDF/CSV): 3h
- Frontend components: 4h
- Tests: 2h

---

## Feature 3: 1099-NEC Generation

**Priority:** CRITICAL | **Effort:** 10-14 hours | **Risk:** MEDIUM-HIGH

### What We're Building

Track contractors paid $600+ and generate IRS-compliant 1099-NEC forms.

### Database Migration (013_1099_nec.sql)

**File:** `src-tauri/migrations/013_1099_nec.sql` (NEW)

```sql
-- Vendors (contractors, not employees)
CREATE TABLE vendors (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    ein             TEXT,                    -- Business EIN (if has one)
    ssn_encrypted   TEXT,                    -- AES-256-GCM encrypted SSN
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal_code     TEXT,
    phone           TEXT,
    email           TEXT,
    total_payments_cents INTEGER DEFAULT 0,  -- Cached total for quick lookup
    is_1099_required INTEGER DEFAULT 0,      -- True if EIN/SSN provided
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Track individual payments to contractors
CREATE TABLE contractor_payments (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    transaction_id  TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    payment_date    TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Generated 1099-NEC forms (audit trail)
CREATE TABLE generated_1099_nec (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    tax_year        INTEGER NOT NULL,
    box1_nonemployee_compensation INTEGER NOT NULL,
    box2_cash_received            INTEGER DEFAULT 0,
    box4_federal_tax_withheld     INTEGER DEFAULT 0,
    box5_state_tax_withheld       INTEGER DEFAULT 0,
    box6_state_number             TEXT,
    generated_at                  TEXT DEFAULT (datetime('now')),
    pdf_path                      TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    UNIQUE(vendor_id, tax_year)
);

CREATE INDEX idx_vendors_client ON vendors(client_id);
CREATE INDEX idx_contractor_payments_vendor ON contractor_payments(vendor_id);
CREATE INDEX idx_contractor_payments_date ON contractor_payments(payment_date);
```

### Rust Domain Model

**File:** `src-tauri/src/domain/vendor.rs` (NEW)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vendor {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub ein: Option<String>,  // Decrypted
    pub ssn: Option<String>,  // Decrypted (only visible in edit form)
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub total_payments_cents: i64,
    pub is_1099_required: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateVendorPayload {
    pub name: String,
    pub ein: Option<String>,
    pub ssn: Option<String>,  // Will be encrypted before storage
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Form1099Nec {
    pub id: String,
    pub vendor_id: String,
    pub vendor_name: String,
    pub vendor_ein: Option<String>,
    pub vendor_ssn: Option<String>,  // Last 4 only for display
    pub vendor_address: String,
    pub tax_year: i32,
    pub box1_nonemployee_compensation: i64,  // In cents
    pub box2_cash_received: i64,
    pub box4_federal_tax_withheld: i64,
    pub box5_state_tax_withheld: i64,
    pub box6_state_number: Option<String>,
    pub generated_at: String,
}

#[derive(Debug, Serialize)]
pub struct Vendor1099Summary {
    pub vendor_id: String,
    pub vendor_name: String,
    pub total_payments_cents: i64,
    pub requires_1099: bool,
    pub has_1099_generated: bool,
}
```

### Rust Commands

**File:** `src-tauri/src/commands/vendor_commands.rs` (NEW)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `create_vendor` | client_id, payload | Vendor | Create new vendor |
| `list_vendors` | client_id | Vec<Vendor> | List all vendors |
| `get_vendor` | vendor_id | Vendor | Get single vendor |
| `update_vendor` | vendor_id, payload | Vendor | Update vendor |
| `delete_vendor` | vendor_id | () | Delete vendor |
| `track_contractor_payment` | vendor_id, transaction_id, amount_cents | () | Link payment to vendor |
| `get_vendors_requiring_1099` | client_id, year | Vec<Vendor1099Summary> | Vendors with $600+ |
| `generate_1099_nec` | vendor_id, year | Form1099Nec | Generate form |
| `generate_all_1099_nec` | client_id, year | Vec<Form1099Nec> | Bulk generate |
| `export_1099_nec_pdf` | vendor_id, year | String | PDF path |
| `export_1099_nec_csv` | client_id, year | String | CSV for e-filing |

**Key Implementation Details:**

```rust
// Find vendors requiring 1099 (paid $600+ in tax year)
fn get_vendors_requiring_1099(
    conn: &rusqlite::Connection,
    client_id: &str,
    year: i32,
) -> Result<Vec<Vendor1099Summary>> {
    let date_from = format!("{year}-01-01");
    let date_to = format!("{}-01-01", year + 1);

    // Query: SUM(contractor_payments.amount_cents) WHERE payment_date BETWEEN
    // HAVING SUM >= 60000 (600 dollars in cents)
}

// Encrypt SSN before storage
fn encrypt_ssn(ssn: &str, passphrase: &str) -> Result<Vec<u8>> {
    let key = ein_key(passphrase)?;
    encrypt_field(&key, ssn.as_bytes())
}
```

### Report Generator

**File:** `src-tauri/src/reports/form_1099_nec.rs` (NEW)

**1099-NEC Layout (IRS Red Copy Format):**

```
Form 1099-NEC
PAYER:                          RECIPIENT:
[Client Name]                   [Vendor Name]
[Client Address]                [Vendor Address]
[EIN if applicable]             [SSN/EIN: XXX-XX-1234]

Box 1: Nonemployee Compensation  $XX,XXX.XX
Box 2: Cash received             $X,XXX.XX
Box 4: Federal tax withheld      $XXX.XX
Box 5: State tax withheld        $XXX.XX
Box 6: State number              XX
```

**CSV Export Format (for e-filing):**
```csv
PayerEIN,PayerName,RecipientSSN,RecipientName,Box1,Box2,Box4,Box5,StateNum
XX-XXXXXXX,Client Name,XX-XXX1234,Vendor Name,1234.56,0.00,0.00,0.00,CA
```

### Frontend Components

**File:** `src/features/vendors/VendorsPage.tsx` (NEW)

**Sub-components:**
- `src/features/vendors/VendorForm.tsx` - Add/edit vendor (W-9 data capture)
- `src/features/vendors/VendorTable.tsx` - List view
- `src/features/vendors/VendorDetailPanel.tsx` - Payment history
- `src/features/reports/1099NecGenerator.tsx` - Preview + bulk generate
- `src/features/reports/1099NecPreview.tsx` - Form preview before export
- `src/lib/vendor-api.ts` - Tauri API wrapper

**UI Layout - Vendors Page:**
```
┌─────────────────────────────────────────────────────┐
│ Vendors                          [+ Add Vendor]     │
├─────────────────────────────────────────────────────┤
│ Name          | EIN/SSN    | Total Paid | 1099?    │
├─────────────────────────────────────────────────────┤
│ ABC Consulting| XX-XXX1234 | $1,200     | [Generate]│
│ XYZ Services  | XX-XXX5678 | $450       | —        │
│ John Doe      | XXX-XX-9012| $2,500     | [Generate]│
└─────────────────────────────────────────────────────┘
```

**UI Layout - 1099-NEC Generator:**
```
┌─────────────────────────────────────────────────────┐
│ Generate 1099-NEC Forms - Tax Year 2026             │
├─────────────────────────────────────────────────────┤
│ Vendors requiring 1099 ($600+):                     │
│ ☑ ABC Consulting    $1,200    [Preview]            │
│ ☑ John Doe          $2,500    [Preview]            │
│                                                     │
│ [Generate Selected] [Export All CSV]                │
└─────────────────────────────────────────────────────┘
```

**Effort Breakdown:**
- Database migration: 1h
- Rust domain + commands: 5h
- SSN encryption (reuse EIN pattern): 1h
- Report generator (PDF/CSV): 3h
- Frontend components: 4h
- Tests: 2h

---

## File Manifest

### New Files to Create

**Rust Backend:**
```
src-tauri/
├── migrations/
│   ├── 011_mileage.sql
│   ├── 012_schedule_c.sql
│   └── 013_1099_nec.sql
├── src/
│   ├── domain/
│   │   ├── mileage_log.rs
│   │   ├── schedule_c.rs
│   │   └── vendor.rs
│   ├── commands/
│   │   ├── mileage.rs
│   │   ├── schedule_c.rs
│   │   └── vendor_commands.rs
│   ├── reports/
│   │   ├── schedule_c.rs
│   │   └── form_1099_nec.rs
│   └── services/
│       └── pdf_generator.rs (shared PDF utilities)
```

**Frontend:**
```
src/
├── features/
│   ├── mileage/
│   │   ├── MileagePage.tsx
│   │   ├── MileageLogForm.tsx
│   │   ├── MileageLogTable.tsx
│   │   └── MileageSummary.tsx
│   ├── vendors/
│   │   ├── VendorsPage.tsx
│   │   ├── VendorForm.tsx
│   │   ├── VendorTable.tsx
│   │   └── VendorDetailPanel.tsx
│   └── reports/
│       ├── ScheduleCPage.tsx
│       ├── ScheduleCReport.tsx
│       ├── ScheduleCMappingEditor.tsx
│       ├── ScheduleCExportButtons.tsx
│       ├── 1099NecGenerator.tsx
│       └── 1099NecPreview.tsx
├── lib/
│   ├── mileage-api.ts
│   ├── vendor-api.ts
│   └── schedule-c-api.ts
```

### Files to Modify

**Rust Backend:**
- `src-tauri/src/commands/mod.rs` - Add new command modules
- `src-tauri/src/domain/mod.rs` - Add new domain modules
- `src-tauri/src/reports/mod.rs` - Add new report modules
- `src-tauri/src/db/client_db.rs` - May need migration updates
- `src-tauri/Cargo.toml` - Add PDF generation dependency (`printpdf` or `pdf_writer`)

**Frontend:**
- `src/App.tsx` - Add routes for /mileage, /vendors, /reports/schedule-c
- `src/components/AppShell.tsx` - Add navigation items
- `src/lib/i18n/en.ts` - Add translations
- `package.json` - Add PDF generation library if needed (`@react-pdf/renderer`)

---

## Test Plan

### Unit Tests (Rust)

**Mileage:**
- `test_get_rate_for_date_returns_correct_rate`
- `test_create_mileage_log_calculates_deduction`
- `test_mileage_deduction_total_by_year`

**Schedule C:**
- `test_schedule_c_line_mapping_default`
- `test_compute_schedule_c_lines_groups_correctly`
- `test_meals_50_percent_limit_applied`
- `test_schedule_c_net_profit_calculation`

**1099-NEC:**
- `test_vendor_ssn_encryption_roundtrip`
- `test_vendors_requiring_1099_threshold_600`
- `test_generate_1099_nec_form_data`
- `test_1099_nec_csv_format`

### Integration Tests (Rust)

- `test_full_mileage_workflow`
- `test_schedule_c_generation_with_sample_data`
- `test_1099_nec_bulk_generation`

### E2E Tests (Playwright)

- `test_create_mileage_log_and_export`
- `test_schedule_c_mapping_edit_and_export`
- `test_vendor_crud_and_1099_generation`

---

## Risks and Unknowns

### Known Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| PDF generation complexity | MEDIUM | Use `@react-pdf/renderer` for React, `printpdf` for Rust |
| SSN encryption key management | HIGH | Reuse existing EIN encryption pattern |
| Schedule C line mapping edge cases | LOW | Allow custom overrides, document defaults |
| 1099-NEC IRS format changes | LOW | Design form template for easy updates |

### Unknowns to Clarify

1. **PDF Export Library:** Which library for PDF generation?
   - Frontend: `@react-pdf/renderer` (React-friendly)
   - Backend: `printpdf`, `pdf_writer`, or `lopdf`
   - Decision: Use frontend PDF generation for consistency with existing reports

2. **Mileage Map Integration:** Should we integrate with Google Maps/Mapbox for auto-distance calculation?
   - Decision: Defer to Phase 2 - start with manual entry

3. **1099 E-filing:** Should we support direct IRS e-filing (FIRE system)?
   - Decision: Defer to Phase 2 - start with CSV export for tax preparers

---

## Implementation Checklist

### Feature 5: Mileage Tracker
- [ ] Create migration `011_mileage.sql`
- [ ] Create `domain/mileage_log.rs`
- [ ] Create `commands/mileage.rs`
- [ ] Create `features/mileage/` components
- [ ] Create `lib/mileage-api.ts`
- [ ] Add navigation route
- [ ] Write unit tests
- [ ] Write E2E test

### Feature 2: Schedule C
- [ ] Create migration `012_schedule_c.sql`
- [ ] Create `domain/schedule_c.rs`
- [ ] Create `commands/schedule_c.rs`
- [ ] Create `reports/schedule_c.rs`
- [ ] Create `features/reports/ScheduleC*` components
- [ ] Create `lib/schedule-c-api.ts`
- [ ] Add navigation route
- [ ] Write unit tests
- [ ] Write E2E test

### Feature 3: 1099-NEC
- [ ] Create migration `013_1099_nec.sql`
- [ ] Create `domain/vendor.rs`
- [ ] Create `commands/vendor_commands.rs`
- [ ] Create `reports/form_1099_nec.rs`
- [ ] Create `features/vendors/` components
- [ ] Create `features/reports/1099Nec*` components
- [ ] Create `lib/vendor-api.ts`
- [ ] Add navigation route
- [ ] Write unit tests
- [ ] Write E2E test

### Cross-Cutting
- [ ] Add translations to `lib/i18n/en.ts`
- [ ] Update `Cargo.toml` with PDF dependencies
- [ ] Update `package.json` with PDF dependencies
- [ ] Update README.md with new features
- [ ] Update docs/FEATURE-ROADMAP-2026.md with implementation status

---

## Total Effort Estimate

| Phase | Hours | Days (8h/day) |
|-------|-------|---------------|
| Feature 5 (Mileage) | 4-6h | 0.5-0.75 |
| Feature 2 (Schedule C) | 8-12h | 1-1.5 |
| Feature 3 (1099-NEC) | 10-14h | 1.25-1.75 |
| **Total** | **22-32h** | **3-4 weeks** (with testing, buffer) |

---

## Success Criteria

Phase 1 is complete when:

1. **Mileage Tracker:**
   - User can log mileage with date, origin, destination, miles
   - IRS rate auto-detected by year
   - Deduction calculated and displayed
   - Export to PDF (IRS log format) works

2. **Schedule C:**
   - COA accounts mapped to Schedule C lines
   - Report auto-populated from ledger data
   - Mapping editor allows overrides
   - PDF export matches IRS form layout
   - 50% meals limit applied automatically

3. **1099-NEC:**
   - Vendors can be created with W-9 data
   - SSN encrypted at rest
   - Vendors with $600+ identified automatically
   - 1099-NEC forms generated in IRS format
   - Bulk generation works
   - CSV export for e-filing works

4. **Quality Gates:**
   - All Rust tests pass (`cargo test`)
   - All E2E tests pass (`pnpm test:e2e`)
   - No clippy warnings (`cargo clippy`)
   - Code formatted (`cargo fmt`, `pnpm biome format`)
   - Security review passed (no hardcoded secrets, encryption verified)
