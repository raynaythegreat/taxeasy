# Client AI Chat + OCR Document Intake — Design Spec

**Date:** 2026-04-14  
**Status:** Approved (4/4 sections)  
**Target version:** v0.2.0  

---

## Overview

A client-scoped AI workspace that combines conversational chat and OCR-based document import into a unified draft-review pipeline. Both entry points feed the same **Draft Queue** for the active client. Nothing touches the general ledger until the user explicitly approves each draft row.

**Entry points:**
1. **AI Chat** — ask questions about the client's books, request draft transactions from conversation
2. **Import Documents** — upload files, run OCR, extract transaction drafts

**Supported file types:** PDFs, scanned documents, phone photos, screenshots, receipt images, bank/credit card statement images.

---

## Section 1 — Workflow & Architecture

### Workspace Layout

Each client gets a dedicated **AI Workspace** accessible from the client tab bar. The workspace has two tabs:

- **Chat** — conversational interface with the AI
- **Import** — drag-and-drop or file-picker document upload

Both tabs share a **Draft Queue** panel visible at the bottom or side of the workspace.

### Document Processing Pipeline

```
Upload file(s) → Store original → Run OCR (glm-ocr:latest) → Extract fields → Create draft rows → User reviews → Approve/Reject → Post to ledger
```

**OCR extraction modes:**
- **Line-by-line** (preferred) — each line item becomes its own draft row with individual amounts, descriptions, dates
- **Summarized** (fallback) — when the document is messy or unstructured, produce one summary draft per document with totals and notes

The system attempts line-by-line first. If the OCR confidence per line is below threshold, it falls back to summarized mode and flags the draft for manual review.

### Draft Queue

- Drafts are grouped by **source document** (filename + hash)
- Each group shows: source document thumbnail/preview, extraction date, model used, draft count, status (pending/partially approved/rejected)
- Expanding a group shows individual draft rows

### Review Screen

Three-panel split layout (**Option A — Split Review Workspace**, approved by user):

| Left Panel | Center Panel | Right Panel |
|---|---|---|
| Source document preview (image/PDF render) | OCR raw text output | Editable draft transaction rows |

**Draft row fields (editable):**
- Date
- Description
- Reference number
- Debit account
- Credit account
- Amount (integer cents)
- Notes

**Actions per row:**
- Approve (posts to ledger)
- Edit (modify fields inline)
- Reject (removes from queue)
- Skip (leave pending, move to next)

**Bulk actions:**
- Approve all visible
- Reject all visible
- Approve selected (checkbox)

### Chat-to-Draft Flow

When a user asks the AI to create a transaction through chat:
1. AI generates a draft transaction in the same draft queue
2. Draft appears with source "Chat" instead of a document filename
3. Same review/approval flow applies — no auto-posting from chat

---

## Section 2 — Client Scope Rules

### Data Boundaries

The AI workspace for a client can **only** access:

- That client's posted transactions
- That client's accounts (chart of accounts)
- That client's uploaded documents and OCR evidence
- That client's business profile and notes (contact, address, tax preparer notes, filing notes)
- That client's fiscal year settings

### Hard Restrictions

- **No cross-client search** — the AI cannot reference, query, or draft transactions for any client other than the active one
- **No cross-client drafting** — draft transactions are scoped to the active client's database
- **No off-topic responses** — the AI should decline or redirect questions unrelated to bookkeeping, tax, accounting, or the client's financial data
- **No data leakage** — chat context from Client A must never appear when working in Client B's workspace

### Implementation

- All AI context is assembled server-side in Rust before sending to the model
- The prompt includes only the active client's data
- Client ID is validated on every command call
- Chat history is stored per-client in the client's encrypted database

---

## Section 3 — Accuracy & Save Rules

### Three-Stage Data Model

```
Evidence → Drafts → Posted Transactions
```

**Stage 1 — Evidence (immutable)**
- Original file (binary, stored in app data directory)
- OCR raw text output
- Extracted fields (JSON)
- Timestamp of extraction
- Model used (e.g., `glm-ocr:latest`)
- Confidence flags (per-field and overall)
- Source document hash (for duplicate detection)

**Stage 2 — Drafts (mutable, client-scoped)**
- Editable transaction rows linked to evidence record
- Can be partial or incorrect without affecting the ledger
- States: `pending`, `approved`, `rejected`
- Each draft has: date, description, reference, debit account, credit account, amount, notes, evidence_id
- Drafts persist across app restarts

**Stage 3 — Posted (immutable ledger entries)**
- Created only after explicit user approval
- Become normal ledger transactions (same schema as manual entries)
- Linked back to evidence via `evidence_id` field on the transaction

### Approval Rules

- **No auto-posting** from chat, OCR, or bulk import
- Every draft must be individually approved, rejected, or left pending
- Bulk approve is available but requires explicit user action (not automatic)

### Validation Before Posting

When the user clicks "Approve" on a draft row, the system validates:

1. **Date is present** and valid
2. **Description is present** and non-empty
3. **Amount is valid** — positive integer cents, non-zero
4. **Debit account assigned** — must exist in client's chart of accounts
5. **Credit account assigned** — must exist in client's chart of accounts
6. **Entry balances** — total debits = total credits (for multi-line entries)
7. **Client match confirmed** — draft client ID matches the account's client ID
8. **Duplicate risk checked** — warn if a similar transaction exists

### Duplicate Protection

The system warns (but does not block) if a posted transaction exists with:
- Same date (±1 day tolerance)
- Same amount
- Same vendor/description (fuzzy match, case-insensitive substring)
- Same source document hash

Warning displays the matching posted transaction details so the user can decide whether to proceed.

### Reports

- All reports (P&L, Balance Sheet, Cash Flow) use **only posted transactions**
- No draft projection or draft inclusion in v1 reports
- Drafts are visible in the draft queue only, not in transaction lists or reports

---

## Section 4 — Settings & Update Reliability

### Settings Architecture

Settings are split into two model configuration lanes:

#### Chat Model Lane
- **Provider:** Ollama or LM Studio
- **Model selection:** Dropdown listing available models
- **Filters applied:** Exclude OCR models, embedding models, reranker models, and speech models
- **Preferred families:** qwen, llama, gemma, mistral, deepseek, phi, glm (chat-capable only)
- **Purpose:** Conversational AI, bookkeeping Q&A, draft generation from chat

#### OCR Model Lane
- **Provider:** Ollama only (v1 constraint)
- **Model target:** `glm-ocr` family (`glm-ocr:latest` default)
- **Health check:** Confirms model is installed AND can perform image OCR successfully
- **Purpose:** Document scanning, receipt extraction, statement parsing

### Client AI Safety Settings

Located in Settings under a "Client AI Safety" section:

| Setting | Default | Disableable in v1 |
|---|---|---|
| Local-only badge | Visible | No |
| Draft from chat text | Enabled | Yes |
| Draft from files/photos | Enabled | Yes |
| Require approval before posting | Enabled | **No** |

**Local-only badge:** A persistent indicator showing all AI processing happens locally. Displayed in the AI workspace header and settings page.

### Grounding Controls

A section in Settings that shows exactly what the client AI can access:

- ✅ Client business profile (name, entity type, fiscal year, contact info)
- ✅ Client uploaded documents (files, OCR text)
- ✅ Client posted transactions
- ✅ Client chart of accounts
- ✅ Client notes (tax preparer notes, filing notes)
- ❌ Other clients' data
- ❌ Internet-based APIs
- ❌ System files or OS data

This is read-only display (not configurable) — it describes what the system does, not what the user can toggle.

### Update System

The update checker is tied to **GitHub Releases only** (not raw main branch commits).

**Check behavior:**
1. Query `https://api.github.com/repos/raynaythegreat/taxeasy/releases/latest`
2. Compare tag version (semver) against current app version
3. Look for compatible platform asset (`.dmg` for macOS, `.msi` for Windows, `.AppImage` for Linux)

**Status messages:**

| Status | Condition |
|---|---|
| Up to date | Current version >= latest release version |
| New release available | Latest release version > current version AND compatible asset found |
| No compatible asset | Release exists but no asset for current platform |
| Unable to check | Network error, rate limited, or API unreachable |
| Dev build | App version is `0.0.0` or contains `-dev`/`-local` suffix |

**Update flow:**
- Settings > About shows current version and update status
- "Check for Updates" button triggers manual check
- If update available, show release notes (from GitHub release body) and download link
- No auto-download or auto-install in v1 — user initiates download manually

---

## Database Schema Additions

### Evidence Table (in client database)

```sql
CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('document', 'chat')),
    source_file_name TEXT,
    source_file_hash TEXT,
    source_file_path TEXT,
    ocr_raw_text TEXT,
    extracted_fields TEXT,
    model_used TEXT NOT NULL,
    confidence_score REAL,
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
```

### Draft Transactions Table (in client database)

```sql
CREATE TABLE IF NOT EXISTS draft_transactions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    date TEXT,
    description TEXT,
    reference TEXT,
    debit_account_id TEXT,
    credit_account_id TEXT,
    amount INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT('pending') CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
```

### Chat Messages Table (in client database)

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    evidence_id TEXT,
    created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
```

---

## New Tauri Commands

### Evidence Commands
- `store_evidence(client_id, source_type, file_name?, file_data?, ocr_text?, extracted_fields?, model_used, confidence?) → Evidence`
- `get_evidence(client_id, evidence_id) → Evidence`
- `list_evidence(client_id) → Vec<Evidence>`
- `delete_evidence(client_id, evidence_id) → ()`

### Draft Commands
- `create_draft(client_id, evidence_id, date?, description?, reference?, debit_account_id?, credit_account_id?, amount?, notes?) → DraftTransaction`
- `update_draft(client_id, draft_id, ...) → DraftTransaction`
- `list_drafts(client_id, status?) → Vec<DraftTransaction>`
- `approve_draft(client_id, draft_id) → Transaction` (validates and creates posted transaction)
- `reject_draft(client_id, draft_id) → ()`
- `bulk_approve_drafts(client_id, draft_ids) → Vec<Transaction>`
- `bulk_reject_drafts(client_id, draft_ids) → ()`

### Chat Commands
- `send_chat_message(client_id, message) → ChatResponse` (includes any generated drafts)
- `get_chat_history(client_id) → Vec<ChatMessage>`
- `clear_chat_history(client_id) → ()`

### OCR Commands
- `ocr_document(client_id, file_path) → OcrResult` (runs OCR and stores evidence + drafts)
- `ocr_bulk(client_id, file_paths) → Vec<OcrResult>`

---

## Frontend Components

### New Files
- `src/features/ai/AiWorkspace.tsx` — Main workspace with Chat/Import tabs + Draft Queue
- `src/features/ai/ChatPanel.tsx` — Chat interface
- `src/features/ai/ImportPanel.tsx` — Document upload interface
- `src/features/ai/DraftQueue.tsx` — Draft queue panel
- `src/features/ai/DraftReview.tsx` — Three-panel review screen (Option A layout)
- `src/features/ai/EvidencePreview.tsx` — Document preview component
- `src/features/ai/OcrRawText.tsx` — Raw OCR text display
- `src/features/ai/DraftRowEditor.tsx` — Inline editable draft row
- `src/lib/ai-api.ts` — Chat, evidence, draft, OCR IPC wrappers
- `src/lib/draft-api.ts` — Draft CRUD IPC wrappers

### Modified Files
- `src/components/ClientWorkspace.tsx` — Add "AI" tab to client tab bar
- `src/features/settings/SettingsPage.tsx` — Add Client AI Safety section, Grounding Controls
- `src/lib/i18n/en.ts` — Add AI workspace translation keys
- `src/lib/i18n/es.ts` — Add Spanish translations for AI workspace

---

## Out of Scope (v1)

- Auto-posting from any source
- Bank feed integration
- Multi-client batch operations
- Cloud AI providers (OpenAI, Anthropic, Google)
- Voice input/output
- Real-time collaboration
- Draft projection in financial reports
- Smart categorization learning from approval patterns
- Recurring transaction generation from OCR patterns
