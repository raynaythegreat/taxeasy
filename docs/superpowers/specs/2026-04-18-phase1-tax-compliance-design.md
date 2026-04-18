# Phase 1 Tax Compliance Implementation Design

**Date:** 2026-04-18
**Status:** Draft
**Priority:** CRITICAL

## Overview

Complete Phase 1 tax compliance features (Schedule C, 1099-NEC, Mileage) with full backend implementation, frontend integration, and bug fixes.

## Goals

1. ✅ Build complete Schedule C auto-fill functionality
2. ✅ Build complete 1099-NEC generation system
3. ✅ Build complete Mileage tracking with IRS rates
4. ✅ Fix Clients page spacing and other UI issues
5. ✅ Foundation for Phase 2 (Bank Feeds & Reconciliation)

## Architecture

### Domain-Driven Design

```
React Frontend → Tauri IPC → Command Handlers → Domain Layer → Repository → Database
     ↓                ↓              ↓              ↓            ↓
  User Action    Validation     Business Logic   SQL Queries   SQLCipher
     ↓                ↓              ↓            ↓            ↓
  State Update   Error Response   Result Type   Transaction   Encrypted Data
```

### Module Structure

Each feature is a standalone module:
- **Schedule C Module**: COA mappings, report generation
- **1099-NEC Module**: Vendor management, form generation
- **Mileage Module**: Log tracking, deduction calculation

### Repository Pattern

All data access goes through repository layer:
- Abstracts SQL queries
- Handles encryption/decryption
- Provides type-safe API

## Implementation Phases

### Phase 1A: Schedule C Backend + Frontend

**Database Schema** (migration: 012_schedule_c.sql)

```sql
CREATE TABLE coa_schedule_c_mappings (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    schedule_c_line TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE(client_id, account_id)
);
```

**Domain Types** (`src-tauri/src/domain/schedule_c.rs`)

```rust
pub struct CoaMapping {
    pub id: String,
    pub client_id: String,
    pub account_id: String,
    pub schedule_c_line: String,
}

pub struct ScheduleCReport {
    pub year: i32,
    pub lines: HashMap<String, i64>,  // line number → amount in cents
}

pub struct ScheduleCLine {
    pub line_number: String,
    pub description: String,
    pub amount_cents: i64,
}
```

**API Commands**

```rust
#[tauri::command]
async fn generate_schedule_c(client_id: String, year: i32) -> Result<ScheduleCReport>

#[tauri::command]
async fn get_schedule_c_mappings(client_id: String) -> Result<Vec<CoaMapping>>

#[tauri::command]
async fn update_schedule_c_mapping(
    client_id: String,
    account_id: String,
    line: String
) -> Result<()>

#[tauri::command]
async fn export_schedule_c_pdf(client_id: String, year: i32) -> Result<String>
```

**Frontend Components**

- `ScheduleCPage.tsx`: Main report view with line-by-line display
- `ScheduleCMappingEditor.tsx`: Edit account → line mappings
- Export buttons: PDF (IRS format) + CSV

### Phase 1B: 1099-NEC Backend + Frontend

**Database Schema** (migration: 013_vendors_1099.sql)

```sql
CREATE TABLE vendors (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ein TEXT,
    ssn_encrypted TEXT,  -- AES-256-GCM encrypted
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

**Domain Types** (`src-tauri/src/domain/vendors_1099.rs`)

```rust
pub struct Vendor {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub ein: Option<String>,
    pub ssn_encrypted: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub total_payments_cents: i64,
}

pub struct ContractorPayment {
    pub id: String,
    pub vendor_id: String,
    pub transaction_id: String,
    pub amount_cents: i64,
    pub payment_date: String,
}

pub struct Form1099Nec {
    pub vendor_id: String,
    pub year: i32,
    pub box1_nonemployee_compensation: i64,
    pub box4_federal_tax_withheld: i64,
}
```

**API Commands**

```rust
#[tauri::command]
async fn create_vendor(client_id: String, vendor: CreateVendorPayload) -> Result<Vendor>

#[tauri::command]
async fn list_vendors(client_id: String) -> Result<Vec<Vendor>>

#[tauri::command]
async fn update_vendor(vendor_id: String, vendor: UpdateVendorPayload) -> Result<Vendor>

#[tauri::command]
async fn delete_vendor(vendor_id: String) -> Result<()>

#[tauri::command]
async fn track_contractor_payment(
    vendor_id: String,
    transaction_id: String,
    amount_cents: i64
) -> Result<()>

#[tauri::command]
async fn generate_1099_nec(vendor_id: String, year: i32) -> Result<Form1099Nec>

#[tauri::command]
async fn get_vendors_requiring_1099(client_id: String, year: i32) -> Result<Vec<Vendor>>

#[tauri::command]
async fn export_1099_nec_pdf(vendor_id: String, year: i32) -> Result<String>
```

**Frontend Components**

- `VendorsPage.tsx`: Vendor list, search, filters
- `VendorForm.tsx`: Add/edit vendor with W-9 data
- `Form1099Preview.tsx`: Preview before export
- Bulk export: Generate all 1099s for year

### Phase 1C: Mileage Backend + Frontend

**Database Schema** (migration: 014_mileage.sql)

```sql
CREATE TABLE mileage_logs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    date TEXT NOT NULL,
    purpose TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    miles_real REAL NOT NULL,
    rate_cents INTEGER NOT NULL,
    deduction_cents INTEGER GENERATED ALWAYS AS
        (CAST(miles_real * rate_cents AS INTEGER)) STORED,
    notes TEXT,
    receipt_image_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE irs_mileage_rates (
    year INTEGER PRIMARY KEY,
    rate_cents INTEGER NOT NULL
);

INSERT INTO irs_mileage_rates VALUES
    (2026, 70),   -- projected
    (2025, 65),
    (2024, 67),
    (2023, 65);
```

**Domain Types** (`src-tauri/src/domain/mileage.rs`)

```rust
pub struct MileageLog {
    pub id: String,
    pub client_id: String,
    pub date: String,
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub rate_cents: i32,
    pub deduction_cents: i64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}

pub struct IrsRate {
    pub year: i32,
    pub rate_cents: i32,
}

pub struct MileageSummary {
    pub year: i32,
    pub total_miles: f64,
    pub total_deduction_cents: i64,
    pub log_count: i32,
}
```

**API Commands**

```rust
#[tauri::command]
async fn create_mileage_log(client_id: String, log: CreateMileagePayload) -> Result<MileageLog>

#[tauri::command]
async fn list_mileage_logs(client_id: String, year: i32) -> Result<Vec<MileageLog>>

#[tauri::command]
async fn update_mileage_log(log_id: String, log: UpdateMileagePayload) -> Result<MileageLog>

#[tauri::command]
async fn delete_mileage_log(log_id: String) -> Result<()>

#[tauri::command]
async fn get_mileage_deduction_total(client_id: String, year: i32) -> Result<i64>

#[tauri::command]
async fn get_mileage_summary(client_id: String, year: i32) -> Result<MileageSummary>

#[tauri::command]
async fn get_irs_mileage_rate(year: i32) -> Result<i32>

#[tauri::command]
async fn export_mileage_log_pdf(client_id: String, year: i32) -> Result<String>
```

**Frontend Components**

- `MileagePage.tsx`: Log list, yearly summary chart
- `MileageForm.tsx`: Quick-add form (date, purpose, origin→dest, miles)
- `MileageSummary.tsx`: Yearly breakdown with totals
- Export: PDF log (IRS audit-ready) + CSV

### Phase 1D: Bug Fixes & Polish

**Clients Page Fix**
- Remove extra spacing at bottom of page
- Fix layout constraints
- Test scrolling behavior

**General Polish**
- Fix TypeScript errors
- Improve loading states
- Better error messages
- Keyboard shortcuts

## Error Handling

All commands use unified error structure:

```rust
#[derive(Debug, thiserror::Error)]
pub enum TaxeasyError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Client not found: {0}")]
    ClientNotFound(String),

    #[error("Vendor not found: {0}")]
    VendorNotFound(String),

    #[error("Mileage log not found: {0}")]
    MileageLogNotFound(String),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

pub type Result<T> = std::result::Result<T, TaxeasyError>;
```

## Testing Strategy

### Unit Tests

**Domain Types**
- Vendor EIN format validation
- Mileage deduction calculation
- Schedule C line mapping logic

### Integration Tests

**Database Operations**
- CRUD for vendors, mileage logs, mappings
- Encryption/decryption of SSN
- Foreign key constraints

**API Commands**
- Command execution via Tauri test framework
- Error handling paths
- Response format validation

### Test Coverage Targets

- Domain layer: 90%+
- Commands: 80%+
- Frontend: 70%+

### Example Tests

```rust
#[test]
fn test_mileage_deduction_calculation() {
    let log = MileageLog {
        miles_real: 100.0,
        rate_cents: 67,
        ..Default::default()
    };
    assert_eq!(log.deduction_cents, 6700);
}

#[test]
fn test_vendor_ein_validation() {
    assert!(validate_ein("12-3456789").is_ok());
    assert!(validate_ein("invalid").is_err());
}
```

## File Structure

### Backend Files

```
src-tauri/
├── migrations/
│   ├── 012_schedule_c.sql
│   ├── 013_vendors_1099.sql
│   └── 014_mileage.sql
├── src/
│   ├── domain/
│   │   ├── schedule_c.rs
│   │   ├── vendors_1099.rs
│   │   └── mileage.rs
│   ├── commands/
│   │   ├── schedule_c.rs
│   │   ├── vendors_1099.rs
│   │   └── mileage.rs
│   ├── db/
│   │   └── client_db.rs
│   └── lib.rs
```

### Frontend Files

```
src/
├── features/
│   ├── schedule-c/
│   │   ├── ScheduleCPage.tsx
│   │   └── ScheduleCReport.tsx
│   ├── vendors/
│   │   ├── VendorsPage.tsx
│   │   └── VendorForm.tsx
│   └── mileage/
│       ├── MileagePage.tsx
│       └── MileageForm.tsx
├── lib/
│   ├── schedule-c-api.ts
│   ├── vendors-1099-api.ts
│   └── mileage-api.ts
└── components/
    └── ClientWorkspace.tsx  # Fix spacing issue
```

## Implementation Order

1. **Mileage** (simplest, good warm-up)
   - Migration → Domain → Commands → Frontend
   - ~2 days

2. **Schedule C** (medium complexity)
   - Migration → Domain → Commands → Frontend
   - ~3 days

3. **1099-NEC** (most complex, encryption)
   - Migration → Domain → Commands → Frontend
   - ~4 days

4. **Bug Fixes** (concurrent with above)
   - Clients page spacing
   - Polish and testing
   - ~1 day

**Total: ~10 days (2 weeks)**

## Success Criteria

✅ All three features working end-to-end
✅ Database migrations run successfully
✅ Frontend components render without errors
✅ Export functionality works (PDF + CSV)
✅ Test coverage targets met
✅ Clients page spacing fixed
✅ No TypeScript errors
✅ All commands tested manually

## Next Steps

1. Implement Mileage feature
2. Implement Schedule C feature
3. Implement 1099-NEC feature
4. Fix Clients page and polish
5. Integration testing
6. Begin Phase 2 (Bank Feeds & Reconciliation)
