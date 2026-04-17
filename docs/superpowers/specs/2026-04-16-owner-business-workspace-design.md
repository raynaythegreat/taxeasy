# Owner Business Workspace + Owner-Scoped Dashboard — Design Spec

**Date:** 2026-04-16  
**Status:** Approved  
**Target version:** v0.3.0

---

## Overview

Taxeasy currently treats the main dashboard as a visual shell around whichever client ledger was opened most recently. That causes the owner's dashboard cards, charts, expenses, and recent activity to drift with client navigation, which is the opposite of the intended product model.

The approved design makes the owner's business a first-class bookkeeping workspace, separate from clients.

### Product direction

1. The main `Dashboard` becomes the owner-business overview only.
2. A new top-right `My Business` button opens a full owner workspace.
3. The owner business gets a dedicated bookkeeping ledger, fully separate from client ledgers.
4. Client workspaces remain client-only and continue to use their own ledgers.
5. All dashboard, chart, invoice, report, and activity queries move to explicit scope selection instead of implicitly reading `active_client`.

---

## Goals

- Show only owner-business data on the main dashboard.
- Let the owner track their own expenses, revenue, invoices, documents, and reports directly in the app.
- Add a first-class `My Business` workspace with full parity to the client workspace.
- Preserve strict separation between owner data and client data.
- Reuse as much existing client-workspace UI as possible without keeping the data model client-coupled.

## Non-Goals

- No silent migration of an existing client into the owner business.
- No mixed dashboard combining owner and client numbers in a single chart/card.
- No cross-ledger reports that aggregate owner and client bookkeeping together.
- No partial owner-only implementation that leaves invoices or visuals client-scoped.

---

## Section 1 — Navigation & UX

### App-level navigation

The app header gains a new top-right `My Business` button. This is a primary navigation entry point, not a settings shortcut and not a hidden menu item.

### Resulting navigation model

- `Dashboard`
  - Owner-business overview only
- `My Business`
  - Full owner bookkeeping workspace
- `Clients`
  - Client list and client workspaces only
- `Settings`
  - App settings only

### Main dashboard behavior

The main dashboard is no longer a generic landing page. It becomes the owner-business home screen and always renders owner-scoped data.

The main dashboard retains the existing high-level card/chart style, but all displayed numbers must come from the owner ledger only.

### My Business workspace behavior

Clicking `My Business` opens a full workspace with client-level parity:

- `Overview`
- `Transactions`
- `Invoices`
- `Documents`
- `Reports`
- `AI`

The `Overview` tab includes:

- owner business profile banner
- owner analytics block
- quick actions for new transaction/import/view reports
- recent owner invoices/receipts
- owner-only tax/news widgets

### Business profile access

The owner business profile is accessible in two ways:

1. Prominently on `My Business > Overview`
2. Directly from the top-right `My Business` entry point once inside the owner workspace

Profile editing covers:

- business name
- entity type
- EIN
- contact info
- address
- website
- fiscal year start
- accounting method
- tax preparer notes
- filing notes

---

## Section 2 — Owner Data Model

### Approved model

The owner business uses a dedicated ledger separate from all client ledgers.

The existing `business_profile` table remains app-level metadata only. It is not the ledger and does not store transactional bookkeeping state.

### New bookkeeping source of truth

Add a dedicated owner ledger datastore that mirrors the client-ledger capabilities:

- chart of accounts
- transactions + entries
- invoices / receipts / estimates
- documents
- reports inputs
- AI workspace state where applicable

### Recommended storage shape

Use a separate encrypted owner database, parallel to client databases.

Recommended path shape:

- app DB: `app.db`
- owner ledger DB: `owner.db`
- client ledger DBs: `clients/<uuid>.db`

This preserves the current architectural pattern where bookkeeping entities live in encrypted ledger databases rather than the app-registry database.

### Why a separate owner DB

- avoids treating the owner as a fake client
- preserves clear database boundaries
- lets the owner workspace reuse the client schema model with minimal conceptual distortion
- makes future owner-only backup/restore/export paths straightforward

---

## Section 3 — Scope Model

### Problem being fixed

Current dashboard analytics commands implicitly depend on `active_client`. That makes owner-facing UI unstable and leaks whichever client was last opened into the dashboard.

### Approved scope contract

All shared analytics and bookkeeping queries must accept an explicit scope.

Recommended scope model:

```ts
type BookkeepingScope =
  | { kind: "owner" }
  | { kind: "client"; clientId: string };
```

### Scope rules

- `Dashboard` always uses `{ kind: "owner" }`
- `My Business` always uses `{ kind: "owner" }`
- `ClientWorkspace` always uses `{ kind: "client", clientId }`
- No owner or client UI may rely on `active_client` as an implicit fallback

### Commands and loaders that must become scope-aware

- dashboard stats
- net cash trend
- top expense categories
- deductible expenses
- recent transactions
- invoice list/summary widgets
- report loaders where shared UI is reused
- document summary widgets
- AI workspace routing where shared shell is reused

### Hard safety rule

If no valid scope is provided, data loaders must fail closed to empty/error state. They must never silently fall back to a client ledger for owner UI.

---

## Section 4 — Shared Workspace Refactor

### Current state

The existing workspace shell and overview blocks are designed around client objects and client-scoped Tauri commands.

### Approved refactor direction

Generalize the workspace shell so it can render either:

- an owner workspace model
- a client workspace model

The recommended abstraction is a shared workspace surface with a scoped data source and scoped profile header.

### Reusable shell concerns

- tab bar
- toolbar actions
- overview analytics block
- report controls
- invoices/documents/AI tab routing
- profile header

### Separate per-scope concerns

- profile loader
- ledger DB target
- save/update commands
- invoice/document paths
- routing labels where wording differs

### Result

`ClientWorkspace` and `MyBusinessWorkspace` become thin scope-specific wrappers over shared workspace primitives rather than unrelated implementations.

---

## Section 5 — Main Dashboard Content

### Owner-only KPIs

The main dashboard should display owner-scoped values only.

Recommended KPI set:

- revenue
- expenses
- net income
- total transactions
- invoice summary showing **open invoices count** and **outstanding invoice balance**

### Owner-only visuals

Charts on the main dashboard must use owner data only:

- income vs expenses
- net cash trend
- top expense categories
- account composition
- deductible expenses

### Owner-only activity panels

The dashboard should include:

- recent owner transactions
- recent owner invoices / receipts

### Business identity

The owner business profile banner stays at the top of the dashboard and reflects only `business_profile` metadata.

---

## Section 6 — My Business Workspace Details

### Overview tab

The `My Business > Overview` tab contains:

- owner business profile banner + edit button
- shared owner analytics block
- recent owner transactions
- recent owner invoices / receipts
- owner tax/news section

### Transactions tab

Supports the same capabilities as client transactions, but posts into the owner ledger.

This includes:

- manual entry
- imports
- edits/deletes
- account-based filtering
- ledger views

### Invoices tab

Supports owner invoices, receipts, and estimates with the same UX as client invoices.

All owner invoice objects must live in the owner ledger, not under any client.

### Documents tab

Supports owner receipt and tax-document storage, separate from client documents.

### Reports tab

Supports owner-scoped:

- Profit & Loss
- Balance Sheet
- Cash Flow
- Year-over-year comparison

### AI tab

The `AI` tab is included in v1 of this feature for full workspace parity. All AI actions inside `My Business` must be scoped to owner data only.

---

## Section 7 — Business Profile + Ledger Relationship

### Approved relationship

`business_profile` and the owner ledger are related but distinct.

- `business_profile` stores owner metadata
- owner ledger stores bookkeeping state

### Initialization flow

On first access to `My Business` or the owner dashboard:

1. ensure `business_profile` exists
2. ensure owner ledger DB exists
3. seed owner chart of accounts based on profile entity type if ledger is new
4. bind owner dashboard/workspace queries to the owner scope

### Fiscal settings

Owner reports and owner dashboard period behavior should derive from the owner business profile, not any client’s fiscal settings.

---

## Section 8 — Migration & Compatibility

### No silent conversion

Do not silently map an existing client to the owner business.

### First-pass compatibility strategy

- existing clients remain untouched
- owner ledger is created independently
- dashboard immediately stops using client fallback behavior
- owner widgets show empty state until owner bookkeeping records exist

### Optional future migration path

If needed later, a deliberate import or "promote existing client into owner business" flow can be added. That is not part of this feature.

---

## Section 9 — Error Handling & Empty States

### Error handling

Owner UI must show owner-specific failures and never render client fallback data.

Examples:

- owner ledger missing: show owner setup state
- owner invoices unavailable: show invoice-specific empty/error state
- owner charts unavailable: show chart empty state, not stale client results

### Empty state rules

- zero owner transactions => cards render zero, charts render no-data state
- zero owner invoices => invoices widget shows empty invoice state
- incomplete business profile => prompt to finish owner profile setup

### Dashboard fallback rule

If the owner ledger is empty, the dashboard should still render structurally complete with zeros and empty widgets.

It must not look broken and must not substitute client values.

---

## Section 10 — Verification

### Functional verification

1. Create owner transactions and confirm only owner dashboard changes.
2. Switch among clients and confirm owner dashboard numbers do not change.
3. Create client transactions and confirm owner dashboard does not change.
4. Create owner invoices and confirm owner invoice widgets update.
5. Create client invoices and confirm owner invoice widgets do not change.
6. Open `My Business` and confirm all tabs use owner data only.

### UI verification

- top-right `My Business` button visible and stable
- owner dashboard widgets render correctly
- owner profile banner and edit flow work
- owner recent invoices panel appears on dashboard/overview
- visuals match owner ledger, not client ledger

### Regression verification

- client workspaces still load correctly
- switching clients still works
- reports still work for clients
- tax/news navigation still respects scope

### Test coverage targets

- unit/integration coverage for scope selection logic
- UI coverage for header navigation and workspace routing
- regression coverage for owner/client isolation

---

## Implementation Summary

The implementation should proceed in this order:

1. Introduce owner scope and owner ledger storage.
2. Make shared analytics/query APIs scope-aware.
3. Refactor shared workspace UI to support owner and client scopes.
4. Build `My Business` workspace using full client-workspace parity.
5. Repoint main dashboard to owner-only data and add owner invoice/activity widgets.
6. Verify scope isolation thoroughly before merge.

This design intentionally fixes the owner-dashboard bug at the architecture level rather than continuing to patch around `active_client` behavior.
