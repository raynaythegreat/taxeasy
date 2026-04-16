# Accounting Method Gap Analysis

## Current state (as of 2026-04-15)

The `clients` table and `business_profile` table both carry an
`accounting_method TEXT CHECK (accounting_method IN ('cash', 'accrual'))`
column.  The value is stored, surfaced in the UI, and passed to the frontend
— but **no report query currently reads it**.  Every P&L, Balance Sheet, Cash
Flow, and Dashboard YTD query runs identical SQL regardless of whether the
client has selected cash-basis or accrual-basis accounting.

## What the distinction means

| Basis   | Revenue recognised when…         | Expense recognised when…            |
|---------|----------------------------------|-------------------------------------|
| Accrual | Invoice is issued (earned)       | Bill is received / obligation incurred |
| Cash    | Payment is received (deposited)  | Payment is made (cleared)           |

## What would be required to close the gap

### Data model changes

The current double-entry model records all economic events in `transactions`
and `entries` without distinguishing the *type* of economic event.  To
support cash-basis filtering, each transaction (or entry) must be tagged with
its economic event type.  Two practical approaches:

**Option A — Transaction kind column**
Add `kind TEXT CHECK (kind IN ('cash_receipt','cash_payment','invoice_issued',
'bill_received','journal','adjustment'))` to `transactions`.

- Cash-basis report: `WHERE kind IN ('cash_receipt','cash_payment','journal','adjustment')`
- Accrual-basis report: all rows (existing behaviour)

**Option B — Dedicated Accounts Receivable / Payable settlement tracking**
Model invoices and bills as separate tables with explicit settlement events.
Reports join to settlement events for cash-basis, or to issuance events for
accrual.  This is more correct but requires a larger schema change.

### Query changes

Once events are tagged, the report queries in
`src-tauri/src/reports/{pnl,cash_flow,balance_sheet}.rs` and
`src-tauri/src/commands/dashboard.rs` must accept the `accounting_method`
parameter (already available from the `clients` table) and apply it as a
`WHERE` predicate.

### UI changes

The `report_period_for` command (`src-tauri/src/commands/period.rs`) should
propagate `accounting_method` into the returned `PeriodRange` or a separate
`ReportConfig` struct so every report view can display "Cash basis" /
"Accrual basis" in its header.

## Recommendation

Implement Option A as the minimum viable change.  Tag all transactions
created via `approve_draft` with `kind = 'cash_receipt'` or
`kind = 'cash_payment'` based on the debit/credit account type at approval
time.  Manual journal entries receive `kind = 'journal'`.  This enables
correct cash-basis filtering with a single additional column and no schema
redesign.
