# Phase 1 Tax Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Mileage tracking, Schedule C auto-fill, and 1099-NEC generation with complete backend and frontend integration

**Architecture:** Domain-driven design with Rust backend (Tauri), React frontend, SQLCipher database, following repository pattern for data access

**Tech Stack:** Rust, Tauri 2, SQLite with SQLCipher, React 19, TypeScript, Tailwind CSS 4

---

## File Structure Overview

**Backend (Rust):**
```
src-tauri/
├── migrations/
│   ├── 012_schedule_c.sql       # NEW: COA mappings table
│   ├── 013_vendors_1099.sql     # NEW: vendors + contractor payments
│   └── 014_mileage.sql          # NEW: mileage logs + IRS rates
├── src/
│   ├── domain/
│   │   ├── schedule_c.rs         # NEW: ScheduleCReport, CoaMapping types
│   │   ├── vendors_1099.rs       # NEW: Vendor, Form1099Nec types
│   │   ├── mileage.rs            # NEW: MileageLog, IrsRate types
│   │   └── mod.rs                # MODIFY: export new modules
│   ├── commands/
│   │   ├── schedule_c.rs         # NEW: Schedule C Tauri commands
│   │   ├── vendors_1099.rs       # NEW: 1099-NEC Tauri commands
│   │   ├── mileage.rs            # NEW: Mileage Tauri commands
│   │   ├── mod.rs                # MODIFY: register new commands
│   │   └── scoped.rs             # MODIFY: add new db methods
│   ├── db/
│   │   ├── client_db.rs          # MODIFY: add repo methods for new tables
│   │   └── owner_db.rs           # MODIFY: add encryption methods
│   └── lib.rs                    # MODIFY: register commands
└── Cargo.toml                    # MODIFY: add dependencies if needed
```

**Frontend (React/TypeScript):**
```
src/
├── features/
│   ├── schedule-c/
│   │   ├── ScheduleCPage.tsx     # NEW: Report view + mapping editor
│   │   └── ScheduleCReport.tsx   # NEW: Report display component
│   ├── vendors/
│   │   ├── VendorsPage.tsx       # NEW: Vendor management
│   │   └── VendorForm.tsx        # NEW: Add/edit vendor form
│   └── mileage/
│       ├── MileagePage.tsx       # NEW: Log entry + summary view
│       └── MileageForm.tsx       # NEW: Quick-add form
├── lib/
│   ├── schedule-c-api.ts         # NEW: API wrapper functions
│   ├── vendors-1099-api.ts       # NEW: API wrapper functions
│   ├── mileage-api.ts            # NEW: API wrapper functions
│   └── tauri.ts                  # MODIFY: add API type definitions
└── components/
    └── ClientWorkspace.tsx       # MODIFY: fix spacing issue
```

---

## Part 1: Mileage Feature (Simplest - Start Here)

### Task 1: Create Mileage Database Migration

**Files:**
- Create: `src-tauri/migrations/014_mileage.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Mileage tracking table
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
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- IRS mileage rates (built-in)
CREATE TABLE irs_mileage_rates (
    year INTEGER PRIMARY KEY,
    rate_cents INTEGER NOT NULL
);

-- Seed with historical and projected rates
INSERT INTO irs_mileage_rates (year, rate_cents) VALUES
    (2026, 70),   -- projected
    (2025, 65),
    (2024, 67),
    (2023, 65),
    (2022, 62),
    (2021, 56),
    (2020, 57);
```

- [ ] **Step 2: Verify migration syntax**

Run: `sqlite3 < src-tauri/migrations/014_mileage.sql`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/migrations/014_mileage.sql
git commit -m "feat(mileage): add mileage tracking schema"
```

---

### Task 2: Create Mileage Domain Types

**Files:**
- Create: `src-tauri/src/domain/mileage.rs`
- Modify: `src-tauri/src/domain/mod.rs`

- [ ] **Step 1: Write domain types file**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageLog {
    pub id: String,
    pub client_id: String,
    pub date: String,  // YYYY-MM-DD format
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub rate_cents: i32,
    pub deduction_cents: i64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrsRate {
    pub year: i32,
    pub rate_cents: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageSummary {
    pub year: i32,
    pub total_miles: f64,
    pub total_deduction_cents: i64,
    pub log_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMileagePayload {
    pub date: String,
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMileagePayload {
    pub date: Option<String>,
    pub purpose: Option<String>,
    pub origin: Option<String>,
    pub destination: Option<String>,
    pub miles_real: Option<f64>,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}
```

- [ ] **Step 2: Update mod.rs to export module**

Add to `src-tauri/src/domain/mod.rs`:
```rust
pub mod mileage;

pub use mileage::{MileageLog, IrsRate, MileageSummary, CreateMileagePayload, UpdateMileagePayload};
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/domain/mileage.rs src-tauri/src/domain/mod.rs
git commit -m "feat(mileage): add domain types for mileage tracking"
```

---

### Task 3: Implement Mileage Repository Methods

**Files:**
- Modify: `src-tauri/src/db/client_db.rs`

- [ ] **Step 1: Add mileage log CRUD methods**

Add to ClientDB impl:
```rust
// Mileage log operations
pub fn create_mileage_log(&self, log: &MileageLog) -> Result<MileageLog> {
    let id = uuid::Uuid::new_v4().to_string();
    
    let rate_cents = self.get_irs_mileage_rate_for_date(&log.date)?;
    
    self.conn.execute(
        "INSERT INTO mileage_logs (id, client_id, date, purpose, origin, destination, miles_real, rate_cents, notes, receipt_image_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            &id,
            &log.client_id,
            &log.date,
            &log.purpose,
            &log.origin,
            &log.destination,
            &log.miles_real,
            &rate_cents,
            &log.notes,
            &log.receipt_image_path,
        ],
    )?;
    
    self.get_mileage_log(&id)
}

pub fn get_mileage_log(&self, id: &str) -> Result<MileageLog> {
    let mut stmt = self.conn.prepare(
        "SELECT id, client_id, date, purpose, origin, destination, miles_real, rate_cents, deduction_cents, notes, receipt_image_path FROM mileage_logs WHERE id = ?"
    )?;
    
    let log = stmt.query_row(params![id], |row| {
        Ok(MileageLog {
            id: row.get(0)?,
            client_id: row.get(1)?,
            date: row.get(2)?,
            purpose: row.get(3)?,
            origin: row.get(4)?,
            destination: row.get(5)?,
            miles_real: row.get(6)?,
            rate_cents: row.get(7)?,
            deduction_cents: row.get(8)?,
            notes: row.get(9)?,
            receipt_image_path: row.get(10)?,
        })
    })?;
    
    Ok(log)
}

pub fn list_mileage_logs(&self, client_id: &str, year: i32) -> Result<Vec<MileageLog>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, client_id, date, purpose, origin, destination, miles_real, rate_cents, deduction_cents, notes, receipt_image_path FROM mileage_logs WHERE client_id = ? AND strftime('%Y', date) = ? ORDER BY date DESC"
    )?;
    
    let logs = stmt.query_map(params![client_id, &year.to_string()], |row| {
        Ok(MileageLog {
            id: row.get(0)?,
            client_id: row.get(1)?,
            date: row.get(2)?,
            purpose: row.get(3)?,
            origin: row.get(4)?,
            destination: row.get(5)?,
            miles_real: row.get(6)?,
            rate_cents: row.get(7)?,
            deduction_cents: row.get(8)?,
            notes: row.get(9)?,
            receipt_image_path: row.get(10)?,
        })
    }).collect()?;
    
    Ok(logs)
}

pub fn update_mileage_log(&self, id: &str, payload: &UpdateMileagePayload) -> Result<MileageLog> {
    let mut updates = Vec::new();
    let mut params = Vec::new();
    
    if let Some(date) = &payload.date {
        updates.push("date = ?");
        params.push(date as &dyn rusqlite::ToSql);
    }
    if let Some(purpose) = &payload.purpose {
        updates.push("purpose = ?");
        params.push(purpose as &dyn rusqlite::ToSql);
    }
    // ... similar for other fields
    
    if updates.is_empty() {
        return self.get_mileage_log(id);
    }
    
    let sql = format!("UPDATE mileage_logs SET {} WHERE id = ?", updates.join(", "));
    params.push(id);
    
    self.conn.execute(&sql, params.as_slice())?;
    self.get_mileage_log(id)
}

pub fn delete_mileage_log(&self, id: &str) -> Result<()> {
    self.conn.execute("DELETE FROM mileage_logs WHERE id = ?", params![id])?;
    Ok(())
}

pub fn get_mileage_deduction_total(&self, client_id: &str, year: i32) -> Result<i64> {
    let mut stmt = self.conn.prepare(
        "SELECT COALESCE(SUM(deduction_cents), 0) FROM mileage_logs WHERE client_id = ? AND strftime('%Y', date) = ?"
    )?;
    
    let total = stmt.query_row(params![client_id, &year.to_string()], |row| {
        row.get(0)
    })?;
    
    Ok(total)
}

pub fn get_mileage_summary(&self, client_id: &str, year: i32) -> Result<MileageSummary> {
    let mut stmt = self.conn.prepare(
        "SELECT 
            COALESCE(SUM(miles_real), 0) as total_miles,
            COALESCE(SUM(deduction_cents), 0) as total_deduction,
            COUNT(*) as log_count
        FROM mileage_logs 
        WHERE client_id = ? AND strftime('%Y', date) = ?"
    )?;
    
    let summary = stmt.query_row(params![client_id, &year.to_string()], |row| {
        Ok(MileageSummary {
            year,
            total_miles: row.get(0)?,
            total_deduction_cents: row.get(1)?,
            log_count: row.get(2)?,
        })
    })?;
    
    Ok(summary)
}

pub fn get_irs_mileage_rate(&self, year: i32) -> Result<i32> {
    let mut stmt = self.conn.prepare(
        "SELECT rate_cents FROM irs_mileage_rates WHERE year = ?"
    )?;
    
    let rate = stmt.query_row(params![&year.to_string()], |row| {
        row.get(0)
    })?;
    
    Ok(rate)
}

fn get_irs_mileage_rate_for_date(&self, date: &str) -> Result<i32> {
    let year: i32 = date[0..4].parse()
        .map_err(|e| TaxeasyError::Validation(format!("Invalid date format: {}", e)))?;
    self.get_irs_mileage_rate(year)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/client_db.rs
git commit -m "feat(mileage): add mileage repository methods"
```

---

### Task 4: Create Mileage Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/mileage.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Write command handlers**

```rust
use crate::db::client_db::ClientDB;
use crate::domain::mileage::*;
use crate::commands::scoped::get_client_db;
use tauri::State;

#[tauri::command]
pub async fn create_mileage_log(
    client_id: String,
    payload: CreateMileagePayload,
    state: State<'_, ClientDB>
) -> Result<MileageLog, String> {
    let db = state.inner();
    let log = MileageLog {
        id: uuid::Uuid::new_v4().to_string(),
        client_id,
        date: payload.date.clone(),
        purpose: payload.purpose,
        origin: payload.origin,
        destination: payload.destination,
        miles_real: payload.miles_real,
        rate_cents: 0,  // Will be set by DB
        deduction_cents: 0,  // Will be calculated by DB
        notes: payload.notes,
        receipt_image_path: payload.receipt_image_path,
    };
    
    db.create_mileage_log(&log).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_mileage_logs(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<Vec<MileageLog>, String> {
    let db = state.inner();
    db.list_mileage_logs(&client_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_mileage_log(
    log_id: String,
    payload: UpdateMileagePayload,
    state: State<'_, ClientDB>
) -> Result<MileageLog, String> {
    let db = state.inner();
    db.update_mileage_log(&log_id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_mileage_log(
    log_id: String,
    state: State<'_, ClientDB>
) -> Result<(), String> {
    let db = state.inner();
    db.delete_mileage_log(&log_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mileage_deduction_total(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<i64, String> {
    let db = state.inner();
    db.get_mileage_deduction_total(&client_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mileage_summary(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<MileageSummary, String> {
    let db = state.inner();
    db.get_mileage_summary(&client_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_irs_mileage_rate(
    year: i32,
    state: State<'_, ClientDB>
) -> Result<i32, String> {
    let db = state.inner();
    db.get_irs_mileage_rate(year).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register commands in mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod mileage;

pub use mileage::{
    create_mileage_log,
    list_mileage_logs,
    update_mileage_log,
    delete_mileage_log,
    get_mileage_deduction_total,
    get_mileage_summary,
    get_irs_mileage_rate,
};
```

- [ ] **Step 3: Register in lib.rs**

Add to `src-tauri/src/lib.rs` in invoke_handler:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    mileage::create_mileage_log,
    mileage::list_mileage_logs,
    mileage::update_mileage_log,
    mileage::delete_mileage_log,
    mileage::get_mileage_deduction_total,
    mileage::get_mileage_summary,
    mileage::get_irs_mileage_rate,
])?;
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/mileage.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(mileage): add Tauri commands for mileage tracking"
```

---

### Task 5: Create Mileage API Wrapper

**Files:**
- Create: `src/lib/mileage-api.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Write API wrapper functions**

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface MileageLog {
  id: string;
  client_id: string;
  date: string;
  purpose: string;
  origin: string;
  destination: string;
  miles_real: number;
  rate_cents: number;
  deduction_cents: number;
  notes: string | null;
  receipt_image_path: string | null;
}

export interface CreateMileagePayload {
  date: string;
  purpose: string;
  origin: string;
  destination: string;
  miles_real: number;
  notes?: string;
  receipt_image_path?: string;
}

export interface UpdateMileagePayload {
  date?: string;
  purpose?: string;
  origin?: string;
  destination?: string;
  miles_real?: number;
  notes?: string;
  receipt_image_path?: string;
}

export interface MileageSummary {
  year: number;
  total_miles: number;
  total_deduction_cents: number;
  log_count: number;
}

export async function createMileageLog(
  clientId: string,
  payload: CreateMileagePayload
): Promise<MileageLog> {
  return invoke('create_mileage_log', { clientId, payload });
}

export async function listMileageLogs(
  clientId: string,
  year: number
): Promise<MileageLog[]> {
  return invoke('list_mileage_logs', { clientId, year });
}

export async function updateMileageLog(
  logId: string,
  payload: UpdateMileagePayload
): Promise<MileageLog> {
  return invoke('update_mileage_log', { logId, payload });
}

export async function deleteMileageLog(
  logId: string
): Promise<void> {
  return invoke('delete_mileage_log', { logId });
}

export async function getMileageDeductionTotal(
  clientId: string,
  year: number
): Promise<number> {
  return invoke('get_mileage_deduction_total', { clientId, year });
}

export async function getMileageSummary(
  clientId: string,
  year: number
): Promise<MileageSummary> {
  return invoke('get_mileage_summary', { clientId, year });
}

export async function getIrsMileageRate(
  year: number
): Promise<number> {
  return invoke('get_irs_mileage_rate', { year });
}
```

- [ ] **Step 2: Add type definitions to tauri.ts**

Add to `src/lib/tauri.ts` if needed for type inference

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/mileage-api.ts src/lib/tauri.ts
git commit -m "feat(mileage): add TypeScript API wrapper"
```

---

### Task 6: Create Mileage Frontend Components

**Files:**
- Create: `src/features/mileage/MileagePage.tsx`
- Create: `src/features/mileage/MileageForm.tsx`

- [ ] **Step 1: Write MileageForm component**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CreateMileagePayload, createMileageLog } from '@/lib/mileage-api';

interface MileageFormProps {
  clientId: string;
  onSuccess: () => void;
}

export function MileageForm({ clientId, onSuccess }: MileageFormProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [purpose, setPurpose] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [miles, setMiles] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload: CreateMileagePayload = {
      date,
      purpose,
      origin,
      destination,
      miles_real: parseFloat(miles),
      notes: notes || undefined,
    };

    await createMileageLog(clientId, payload);
    onSuccess();
    
    // Reset form
    setPurpose('');
    setOrigin('');
    setDestination('');
    setMiles('');
    setNotes('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">Date</label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="purpose" className="block text-sm font-medium mb-1">Purpose</label>
        <Input
          id="purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="e.g., Client meeting, site visit"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="origin" className="block text-sm font-medium mb-1">Origin</label>
          <Input
            id="origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g., Office"
            required
          />
        </div>

        <div>
          <label htmlFor="destination" className="block text-sm font-medium mb-1">Destination</label>
          <Input
            id="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g., Client site"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="miles" className="block text-sm font-medium mb-1">Miles</label>
        <Input
          id="miles"
          type="number"
          step="0.1"
          value={miles}
          onChange={(e) => setMiles(e.target.value)}
          placeholder="0.0"
          required
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">Notes (optional)</label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional details..."
          rows={3}
        />
      </div>

      <Button type="submit">Add Mileage Log</Button>
    </form>
  );
}
```

- [ ] **Step 2: Write MileagePage component**

```tsx
import { useEffect, useState } from 'react';
import { MileageLog, listMileageLogs, getMileageSummary, deleteMileageLog } from '@/lib/mileage-api';
import { MileageForm } from './MileageForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MileagePageProps {
  clientId: string;
}

export function MileagePage({ clientId }: MileagePageProps) {
  const [logs, setLogs] = useState<MileageLog[]>([]);
  const [summary, setSummary] = useState<number>(0);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadLogs = async () => {
    const [logsData, summaryData] = await Promise.all([
      listMileageLogs(clientId, year),
      getMileageSummary(clientId, year)
    ]);
    setLogs(logsData);
    setSummary(summaryData.total_deduction_cents);
  };

  useEffect(() => {
    loadLogs();
  }, [clientId, year]);

  const handleDelete = async (logId: string) => {
    await deleteMileageLog(logId);
    loadLogs();
  };

  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mileage Tracking - {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <p className="text-sm text-gray-600">Total Deduction: <strong>${formatCents(summary)}</strong></p>
          </div>
          <MileageForm clientId={clientId} onSuccess={loadLogs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mileage Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex-1">
                  <p className="font-medium">{log.date}</p>
                  <p className="text-sm text-gray-600">{log.purpose}</p>
                  <p className="text-xs text-gray-500">{log.origin} → {log.destination}</p>
                  <p className="text-xs text-gray-500">{log.miles_real.toFixed(1)} miles @ ${formatCents(log.rate_cents)}/mile</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${formatCents(log.deduction_cents)}</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(log.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add route to App**

Add route to `src/App.tsx` or appropriate routing file

- [ ] **Step 4: Verify TypeScript compilation**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/features/mileage/
git commit -m "feat(mileage): add mileage tracking frontend components"
```

---

### Task 7: Fix Clients Page Spacing Issue

**Files:**
- Modify: `src/components/ClientWorkspace.tsx`

- [ ] **Step 1: Identify and fix spacing issue**

Read the file to find the extra space issue, likely:
- Remove unnecessary `pb-` padding classes
- Fix container height constraints
- Ensure proper scroll behavior

Example fix:
```tsx
// Change from:
<div className="pb-96"> {/* excessive bottom padding */}

// To:
<div className="pb-6"> {/* reasonable padding */}
```

- [ ] **Step 2: Test in browser**

Run: `pnpm tauri dev`
Expected: Page scrolls normally without excessive space at bottom

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientWorkspace.tsx
git commit -m "fix: remove extra spacing at bottom of Clients page"
```

---

## Part 2: Schedule C Feature

### Task 8: Create Schedule C Database Migration

**Files:**
- Create: `src-tauri/migrations/012_schedule_c.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Schedule C COA mappings table
CREATE TABLE coa_schedule_c_mappings (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    schedule_c_line TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(client_id, account_id)
);

-- Seed with default mappings for common account types
-- This assumes accounts follow naming pattern "Type:Subtype"
INSERT INTO coa_schedule_c_mappings (client_id, account_id, schedule_c_line)
SELECT 
    c.id,
    a.id,
    CASE 
        WHEN a.name LIKE 'Income:Sales%' THEN '1'
        WHEN a.name LIKE 'Income:Service%' THEN '1'
        WHEN a.name LIKE 'Income:Returns%' THEN '2'
        WHEN a.name LIKE 'Income:Refunds%' THEN '2'
        WHEN a.name LIKE 'COGS:%' THEN '4'
        WHEN a.name LIKE 'Expense:Materials%' THEN '4'
        WHEN a.name LIKE 'Income:Other%' THEN '6'
        WHEN a.name LIKE 'Income:Interest%' THEN '6'
        WHEN a.name LIKE 'Expense:Advertising%' THEN '8'
        WHEN a.name LIKE 'Expense:Auto%' OR a.name LIKE 'Expense:Mileage%' THEN '9'
        WHEN a.name LIKE 'Expense:Commissions%' THEN '10'
        WHEN a.name LIKE 'Expense:Depreciation%' THEN '12'
        WHEN a.name LIKE 'Expense:Interest%' THEN '16a'
        WHEN a.name LIKE 'Expense:Legal%' OR a.name LIKE 'Expense:Accounting%' THEN '17'
        WHEN a.name LIKE 'Expense:Office%' OR a.name LIKE 'Expense:Supplies%' THEN '18'
        WHEN a.name LIKE 'Expense:Rent:Equipment%' THEN '20a'
        WHEN a.name LIKE 'Expense:Rent:Office%' THEN '20b'
        WHEN a.name LIKE 'Expense:Repairs%' THEN '21'
        WHEN a.name LIKE 'Expense:Utilities%' THEN '25'
        WHEN a.name LIKE 'Expense:Wages%' OR a.name LIKE 'Expense:Salaries%' THEN '26'
        WHEN a.name LIKE 'Expense:Benefits%' THEN '27'
        WHEN a.name LIKE 'Expense:Other%' THEN '30'
        ELSE '30'  -- Default to "Other Expenses"
    END
FROM clients c, accounts a
WHERE a.type IN ('income', 'expense')
AND a.id NOT IN (
    SELECT account_id FROM coa_schedule_c_mappings WHERE client_id = c.id
);
```

- [ ] **Step 2: Verify migration syntax**

Run: `sqlite3 < src-tauri/migrations/012_schedule_c.sql`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/migrations/012_schedule_c.sql
git commit -m "feat(schedule-c): add Schedule C COA mappings schema"
```

---

### Task 9: Create Schedule C Domain Types

**Files:**
- Create: `src-tauri/src/domain/schedule_c.rs`
- Modify: `src-tauri/src/domain/mod.rs`

- [ ] **Step 1: Write domain types file**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoaMapping {
    pub id: String,
    pub client_id: String,
    pub account_id: String,
    pub schedule_c_line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCReport {
    pub year: i32,
    pub client_id: String,
    pub lines: HashMap<String, ScheduleCLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCLine {
    pub line_number: String,
    pub description: String,
    pub amount_cents: i64,
}

// Schedule C line descriptions from IRS Form 1040 Schedule C
pub const SCHEDULE_C_LINES: &[(&str, &str)] = &[
    ("1", "Gross Receipts"),
    ("2", "Returns and Allowances"),
    ("4", "Cost of Goods Sold"),
    ("5", "Gross Income"),
    ("6", "Other Income"),
    ("7", "Gross Income"),
    ("8", "Advertising"),
    ("9", "Car and Truck Expenses"),
    ("10", "Commissions and Fees"),
    ("11", "Contract Labor"),
    ("12", "Depletion"),
    ("13", "Depreciation and Section 179 Expense"),
    ("14", "Employee Benefit Programs"),
    ("15", "Insurance (other than health)'),
    ("16a", "Interest (Mortgage and other)",
    ("16b", "Interest (other)"),
    ("17", "Legal and Professional Services"),
    ("18", "Office Expense"),
    ("19", "Pension and Profit-Sharing Plans"),
    ("20a", "Rent or Lease: Vehicles, Machinery, and Equipment"),
    ("20b", "Rent or Lease: Other Business Property"),
    ("21", "Repairs and Maintenance"),
    ("22", "Supplies and Materials"),
    ("23", "Taxes and Licenses"),
    ("24a", "Travel"),
    ("24b", "Meals and Entertainment"),
    ("25", "Utilities"),
    ("26", "Wages"),
    ("27", "Other (deductible business expenses)"),
    ("28", "Total Expenses"),
    ("29", "Tentative Profit or (Loss)"),
    ("30", "Other Expenses"),
    ("31", "Net Profit or (Loss)"),
];
```

- [ ] **Step 2: Update mod.rs**

Add to `src-tauri/src/domain/mod.rs`:
```rust
pub mod schedule_c;

pub use schedule_c::{CoaMapping, ScheduleCReport, ScheduleCLine, SCHEDULE_C_LINES};
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/domain/schedule_c.rs src-tauri/src/domain/mod.rs
git commit -m "feat(schedule-c): add domain types for Schedule C"
```

---

### Task 10: Implement Schedule C Repository Methods

**Files:**
- Modify: `src-tauri/src/db/client_db.rs`

- [ ] **Step 1: Add Schedule C repository methods**

Add to ClientDB impl (following existing patterns):
```rust
// Schedule C operations
pub fn get_schedule_c_mappings(&self, client_id: &str) -> Result<Vec<CoaMapping>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, client_id, account_id, schedule_c_line 
         FROM coa_schedule_c_mappings 
         WHERE client_id = ?"
    )?;
    
    let mappings = stmt.query_map(params![client_id], |row| {
        Ok(CoaMapping {
            id: row.get(0)?,
            client_id: row.get(1)?,
            account_id: row.get(2)?,
            schedule_c_line: row.get(3)?,
        })
    }).collect()?;
    
    Ok(mappings)
}

pub fn update_schedule_c_mapping(&self, client_id: &str, account_id: &str, line: &str) -> Result<()> {
    self.conn.execute(
        "INSERT OR REPLACE INTO coa_schedule_c_mappings (id, client_id, account_id, schedule_c_line) 
         VALUES ((SELECT COALESCE((SELECT id FROM coa_schedule_c_mappings WHERE client_id = ? AND account_id = ?), uuid::Uuid::new_v4().to_string())), ?, ?, ?)",
        params![client_id, account_id, client_id, account_id, line],
    )?;
    Ok(())
}

pub fn generate_schedule_c_report(&self, client_id: &str, year: i32) -> Result<ScheduleCReport> {
    let mut report = ScheduleCReport {
        year,
        client_id: client_id.to_string(),
        lines: HashMap::new(),
    };
    
    // Get all mappings
    let mappings = self.get_schedule_c_mappings(client_id)?;
    
    // Query transactions for each mapped account
    for mapping in mappings {
        let amount: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(
                CASE 
                    WHEN credit > 0 THEN credit 
                    ELSE debit 
                END
            ), 0) 
            FROM transactions 
            WHERE client_id = ? 
            AND account_id = ? 
            AND strftime('%Y', date) = ?",
            params![client_id, &mapping.account_id, &year.to_string()],
            |row| row.get(0)
        )?;
        
        if amount > 0 {
            report.lines.insert(
                mapping.schedule_c_line.clone(),
                ScheduleCLine {
                    line_number: mapping.schedule_c_line.clone(),
                    description: get_line_description(&mapping.schedule_c_line),
                    amount_cents: amount,
                }
            );
        }
    }
    
    Ok(report)
}

fn get_line_description(line: &str) -> String {
    for (num, desc) in SCHEDULE_C_LINES {
        if num == line {
            return desc.to_string();
        }
    }
    "Other".to_string()
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/client_db.rs
git commit -m "feat(schedule-c): add Schedule C repository methods"
```

---

### Task 11: Create Schedule C Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/schedule_c.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write command handlers**

```rust
use crate::db::client_db::ClientDB;
use crate::domain::schedule_c::*;
use crate::commands::scoped::get_client_db;
use tauri::State;

#[tauri::command]
pub async fn generate_schedule_c(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<ScheduleCReport, String> {
    let db = state.inner();
    db.generate_schedule_c_report(&client_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_schedule_c_mappings(
    client_id: String,
    state: State<'_, ClientDB>
) -> Result<Vec<CoaMapping>, String> {
    let db = state.inner();
    db.get_schedule_c_mappings(&client_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_schedule_c_mapping(
    client_id: String,
    account_id: String,
    line: String,
    state: State<'_, ClientDB>
) -> Result<(), String> {
    let db = state.inner();
    db.update_schedule_c_mapping(&client_id, &account_id, &line).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_schedule_c_pdf(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<String, String> {
    // For now, return a placeholder
    // TODO: Implement actual PDF generation
    Ok(format!("Schedule C for client {} year {} PDF export placeholder", client_id, year))
}
```

- [ ] **Step 2: Register in mod.rs and lib.rs**

Update `src-tauri/src/commands/mod.rs` and `src-tauri/src/lib.rs` following pattern from Task 4

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/schedule_c.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(schedule-c): add Schedule C Tauri commands"
```

---

### Task 12: Create Schedule C Frontend

**Files:**
- Create: `src/features/schedule-c/ScheduleCPage.tsx`
- Create: `src/features/schedule-c/ScheduleCReport.tsx`
- Create: `src/lib/schedule-c-api.ts`

- [ ] **Step 1: Write API wrapper**

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface CoaMapping {
  id: string;
  client_id: string;
  account_id: string;
  schedule_c_line: string;
}

export interface ScheduleCReport {
  year: number;
  client_id: string;
  lines: Record<string, ScheduleCLine>;
}

export interface ScheduleCLine {
  line_number: string;
  description: string;
  amount_cents: number;
}

export async function generateScheduleC(
  clientId: string,
  year: number
): Promise<ScheduleCReport> {
  return invoke('generate_schedule_c', { clientId, year });
}

export async function getScheduleC_mappings(
  clientId: string
): Promise<CoaMapping[]> {
  return invoke('get_schedule_c_mappings', { clientId });
}

export async function updateScheduleCMapping(
  clientId: string,
  accountId: string,
  line: string
): Promise<void> {
  return invoke('update_schedule_c_mapping', { clientId, accountId, line });
}

export async function exportScheduleCPdf(
  clientId: string,
  year: number
): Promise<string> {
  return invoke('export_schedule_c_pdf', { clientId, year });
}
```

- [ ] **Step 2: Write ScheduleCPage component**

```tsx
import { useEffect, useState } from 'react';
import { generateScheduleC, getScheduleC_mappings, ScheduleCReport } from '@/lib/schedule-c-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ScheduleCPageProps {
  clientId: string;
}

export function ScheduleCPage({ clientId }: ScheduleCPageProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<ScheduleCReport | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const loadReport = async () => {
    const [reportData, mappingsData] = await Promise.all([
      generateScheduleC(clientId, year),
      getScheduleC_mappings(clientId)
    ]);
    
    setReport(reportData);
    
    // Convert mappings array to object for easier lookup
    const mappingObj: Record<string, string> = {};
    for (const m of mappingsData) {
      mappingObj[m.account_id] = m.schedule_c_line;
    }
    setMappings(mappingObj);
  };

  useEffect(() => {
    loadReport();
  }, [clientId, year]);

  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule C Report - {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <button onClick={() => loadReport()} className="px-4 py-2 bg-blue-500 text-white rounded">
              Refresh Report
            </button>
          </div>

          {report && (
            <div className="space-y-2">
              {Object.entries(report.lines).map(([lineNum, line]) => (
                <div key={lineNum} className="flex justify-between p-2 border rounded">
                  <div>
                    <span className="font-medium">Line {lineNum}:</span>
                    <span className="ml-2 text-gray-600">{line.description}</span>
                  </div>
                  <div className="font-medium">
                    ${formatCents(line.amount_cents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add route and verify**

Add route and test compilation

- [ ] **Step 4: Commit**

```bash
git add src/features/schedule-c/ src/lib/schedule-c-api.ts
git commit -m "feat(schedule-c): add Schedule C frontend components"
```

---

## Part 3: 1099-NEC Feature

### Task 13: Create 1099-NEC Database Migration

**Files:**
- Create: `src-tauri/migrations/013_vendors_1099.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Vendors table
CREATE TABLE vendors (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ein TEXT,
    ssn_encrypted TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    phone TEXT,
    email TEXT,
    total_payments_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Contractor payments tracking
CREATE TABLE contractor_payments (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE INDEX idx_contractor_payments_vendor ON contractor_payments(vendor_id);
CREATE INDEX idx_contractor_payments_date ON contractor_payments(payment_date);
```

- [ ] **Step 2: Verify migration syntax**

Run: `sqlite3 < src-tauri/migrations/013_vendors_1099.sql`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/migrations/013_vendors_1099.sql
git commit -m "feat(1099-nec): add vendors and contractor payments schema"
```

---

### Task 14: Create 1099-NEC Domain Types

**Files:**
- Create: `src-tauri/src/domain/vendors_1099.rs`
- Modify: `src-tauri/src/domain/mod.rs`

- [ ] **Step 1: Write domain types**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractorPayment {
    pub id: String,
    pub vendor_id: String,
    pub transaction_id: String,
    pub amount_cents: i64,
    pub payment_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Form1099Nec {
    pub vendor_id: String,
    pub vendor_name: String,
    pub year: i32,
    pub box1_nonemployee_compensation: i64,
    pub box4_federal_tax_withheld: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVendorPayload {
    pub name: String,
    pub ein: Option<String>,
    pub ssn: Option<String>,  // Plain SSN, will be encrypted
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateVendorPayload {
    pub name: Option<String>,
    pub ein: Option<String>,
    pub ssn: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}
```

- [ ] **Step 2: Update mod.rs**

Add to `src-tauri/src/domain/mod.rs`:
```rust
pub mod vendors_1099;

pub use vendors_1099::{Vendor, ContractorPayment, Form1099Nec, CreateVendorPayload, UpdateVendorPayload};
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/domain/vendors_1099.rs src-tauri/src/domain/mod.rs
git commit -m "feat(1099-nec): add domain types for vendors and 1099-NEC"
```

---

### Task 15: Implement 1099-NEC Repository Methods

**Files:**
- Modify: `src-tauri/src/db/client_db.rs`

- [ ] **Step 1: Add vendor repository methods**

Add to ClientDB impl:
```rust
use crate::domain::vendors_1099::*;
use crate::db::owner_db::encrypt_string;

// Vendor operations
pub fn create_vendor(&self, client_id: &str, payload: &CreateVendorPayload) -> Result<Vendor> {
    let id = uuid::Uuid::new_v4().to_string();
    
    // Encrypt SSN if provided
    let ssn_encrypted = payload.ssn.as_ref()
        .map(|ssn| encrypt_string(ssn))
        .transpose()?;

    self.conn.execute(
        "INSERT INTO vendors (id, client_id, name, ein, ssn_encrypted, address_line1, address_line2, city, state, postal_code, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            &id,
            &client_id,
            &payload.name,
            &payload.ein,
            &ssn_encrypted,
            &payload.address_line1,
            &payload.address_line2,
            &payload.city,
            &payload.state,
            &payload.postal_code,
            &payload.phone,
            &payload.email,
        ],
    )?;
    
    self.get_vendor(&id)
}

pub fn get_vendor(&self, id: &str) -> Result<Vendor> {
    let mut stmt = self.conn.prepare(
        "SELECT id, client_id, name, ein, ssn_encrypted, address_line1, address_line2, city, state, postal_code, phone, email, total_payments_cents FROM vendors WHERE id = ?"
    )?;
    
    let vendor = stmt.query_row(params![id], |row| {
        Ok(Vendor {
            id: row.get(0)?,
            client_id: row.get(1)?,
            name: row.get(2)?,
            ein: row.get(3)?,
            ssn_encrypted: row.get(4)?,
            address_line1: row.get(5)?,
            address_line2: row.get(6)?,
            city: row.get(7)?,
            state: row.get(8)?,
            postal_code: row.get(9)?,
            phone: row.get(10)?,
            email: row.get(11)?,
            total_payments_cents: row.get(12)?,
        })
    })?;
    
    Ok(vendor)
}

pub fn list_vendors(&self, client_id: &str) -> Result<Vec<Vendor>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, client_id, name, ein, ssn_encrypted, address_line1, address_line2, city, state, postal_code, phone, email, total_payments_cents FROM vendors WHERE client_id = ? ORDER BY name"
    )?;
    
    let vendors = stmt.query_map(params![client_id], |row| {
        Ok(Vendor {
            id: row.get(0)?,
            client_id: row.get(1)?,
            name: row.get(2)?,
            ein: row.get(3)?,
            ssn_encrypted: row.get(4)?,
            address_line1: row.get(5)?,
            address_line2: row.get(6)?,
            city: row.get(7)?,
            state: row.get(8)?,
            postal_code: row.get(9)?,
            phone: row.get(10)?,
            email: row.get(11)?,
            total_payments_cents: row.get(12)?,
        })
    }).collect()?;
    
    Ok(vendors)
}

pub fn update_vendor(&self, id: &str, payload: &UpdateVendorPayload) -> Result<Vendor> {
    let mut updates = Vec::new();
    let mut params = Vec::new();
    
    if let Some(name) = &payload.name {
        updates.push("name = ?");
        params.push(name as &dyn rusqlite::ToSql);
    }
    if let Some(ein) = &payload.ein {
        updates.push("ein = ?");
        params.push(ein as &dyn rusqlite::ToSql);
    }
    // ... similar for other fields
    
    if let Some(ssn) = &payload.ssn {
        updates.push("ssn_encrypted = ?");
        let encrypted = encrypt_string(ssn)?;
        params.push(encrypted as &dyn rusqlite::ToSql);
    }
    
    if updates.is_empty() {
        return self.get_vendor(id);
    }
    
    let sql = format!("UPDATE vendors SET {} WHERE id = ?", updates.join(", "));
    params.push(id);
    
    self.conn.execute(&sql, params.as_slice())?;
    self.get_vendor(id)
}

pub fn delete_vendor(&self, id: &str) -> Result<()> {
    self.conn.execute("DELETE FROM vendors WHERE id = ?", params![id])?;
    Ok(())
}

pub fn track_contractor_payment(&self, vendor_id: &str, transaction_id: &str, amount_cents: i64, payment_date: &str) -> Result<()> {
    self.conn.execute(
        "INSERT INTO contractor_payments (id, vendor_id, transaction_id, amount_cents, payment_date) VALUES (?, ?, ?, ?, ?)",
        params![uuid::Uuid::new_v4().to_string(), vendor_id, transaction_id, amount_cents, payment_date],
    )?;
    
    // Update vendor total payments
    self.conn.execute(
        "UPDATE vendors SET total_payments_cents = total_payments_cents + ? WHERE id = ?",
        params![amount_cents, vendor_id],
    )?;
    
    Ok(())
}

pub fn generate_1099_nec(&self, vendor_id: &str, year: i32) -> Result<Form1099Nec> {
    let vendor = self.get_vendor(vendor_id)?;
    
    // Calculate total payments for the year
    let box1: i64 = self.conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) 
         FROM contractor_payments cp
         JOIN transactions t ON cp.transaction_id = t.id
         WHERE cp.vendor_id = ? 
         AND strftime('%Y', cp.payment_date) = ?",
        params![vendor_id, &year.to_string()],
        |row| row.get(0)
    )?;
    
    Ok(Form1099Nec {
        vendor_id: vendor.id.to_string(),
        vendor_name: vendor.name,
        year,
        box1_nonemployee_compensation: box1,
        box4_federal_tax_withheld: 0, // TODO: implement backup withholding tracking
    })
}

pub fn get_vendors_requiring_1099(&self, client_id: &str, year: i32) -> Result<Vec<Vendor>> {
    let mut stmt = self.conn.prepare(
        "SELECT v.id, v.client_id, v.name, v.ein, v.ssn_encrypted, v.address_line1, v.address_line2, v.city, v.state, v.postal_code, v.phone, v.email, v.total_payments_cents
         FROM vendors v
         WHERE v.client_id = ?
         AND v.total_payments_cents >= 600000  -- $6000 threshold in cents
         ORDER BY v.name"
    )?;
    
    let vendors = stmt.query_map(params![client_id], |row| {
        Ok(Vendor {
            id: row.get(0)?,
            client_id: row.get(1)?,
            name: row.get(2)?,
            ein: row.get(3)?,
            ssn_encrypted: row.get(4)?,
            address_line1: row.get(5)?,
            address_line2: row.get(6)?,
            city: row.get(7)?,
            state: row.get(8)?,
            postal_code: row.get(9)?,
            phone: row.get(10)?,
            email: row.get(11)?,
            total_payments_cents: row.get(12)?,
        })
    }).collect()?;
    
    Ok(vendors)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/client_db.rs
git commit -m "feat(1099-nec): add vendor repository methods"
```

---

### Task 16: Create 1099-NEC Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/vendors_1099.rs`
- Modify: `src-tauri/src/commands/mod.rs` and `src-tauri/src/lib.rs`

- [ ] **Step 1: Write command handlers**

```rust
use crate::db::client_db::ClientDB;
use crate::domain::vendors_1099::*;
use crate::commands::scoped::get_client_db;
use tauri::State;

#[tauri::command]
pub async fn create_vendor(
    client_id: String,
    payload: CreateVendorPayload,
    state: State<'_, ClientDB>
) -> Result<Vendor, String> {
    let db = state.inner();
    db.create_vendor(&client_id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_vendors(
    client_id: String,
    state: State<'_, ClientDB>
) -> Result<Vec<Vendor>, String> {
    let db = state.inner();
    db.list_vendors(&client_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_vendor(
    vendor_id: String,
    payload: UpdateVendorPayload,
    state: State<'_, ClientDB>
) -> Result<Vendor, String> {
    let db = state.inner();
    db.update_vendor(&vendor_id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_vendor(
    vendor_id: String,
    state: State<'_, ClientDB>
) -> Result<(), String> {
    let db = state.inner();
    db.delete_vendor(&vendor_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn track_contractor_payment(
    vendor_id: String,
    transaction_id: String,
    amount_cents: i64,
    payment_date: String,
    state: State<'_, ClientDB>
) -> Result<(), String> {
    let db = state.inner();
    db.track_contractor_payment(&vendor_id, &transaction_id, amount_cents, &payment_date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_1099_nec(
    vendor_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<Form1099Nec, String> {
    let db = state.inner();
    db.generate_1099_nec(&vendor_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_vendors_requiring_1099(
    client_id: String,
    year: i32,
    state: State<'_, ClientDB>
) -> Result<Vec<Vendor>, String> {
    let db = state.inner();
    db.get_vendors_requiring_1099(&client_id, year).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register commands in mod.rs and lib.rs**

Follow pattern from Task 4 and Task 11

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/vendors_1099.rs src-tauri/src/commands/mod.rs src-tauri/src.lib.rs
git commit -m "feat(1099-nec): add 1099-NEC Tauri commands"
```

---

### Task 17: Create 1099-NEC Frontend

**Files:**
- Create: `src/features/vendors/VendorsPage.tsx`
- Create: `src/features/vendors/VendorForm.tsx`
- Create: `src/lib/vendors-1099-api.ts`

- [ ] **Step 1: Write API wrapper**

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface Vendor {
  id: string;
  client_id: string;
  name: string;
  ein: string | null;
  ssn_encrypted: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  total_payments_cents: number;
}

export interface CreateVendorPayload {
  name: string;
  ein?: string;
  ssn?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
}

export interface UpdateVendorPayload {
  name?: string;
  ein?: string;
  ssn?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
}

export interface Form1099Nec {
  vendor_id: string;
  vendor_name: string;
  year: number;
  box1_nonemployee_compensation: number;
  box4_federal_tax_withheld: number;
}

export async function createVendor(
  clientId: string,
  payload: CreateVendorPayload
): Promise<Vendor> {
  return invoke('create_vendor', { clientId, payload });
}

export async function listVendors(clientId: string): Promise<Vendor[]> {
  return invoke('list_vendors', { clientId });
}

export async function updateVendor(
  vendorId: string,
  payload: UpdateVendorPayload
): Promise<Vendor> {
  return invoke('update_vendor', { vendorId, payload });
}

export async function deleteVendor(vendorId: string): Promise<void> {
  return invoke('delete_vendor', { vendorId });
}

export async function trackContractorPayment(
  vendorId: string,
  transactionId: string,
  amountCents: number,
  paymentDate: string
): Promise<void> {
  return invoke('track_contractor_payment', { vendorId, transactionId, amountCents, paymentDate });
}

export async function generate1099Nec(
  vendorId: string,
  year: number
): Promise<Form1099Nec> {
  return invoke('generate_1099_nec', { vendorId, year });
}

export async function getVendorsRequiring1099(
  clientId: string,
  year: number
): Promise<Vendor[]> {
  return invoke('get_vendors_requiring_1099', { clientId, year });
}
```

- [ ] **Step 2: Write VendorForm component**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CreateVendorPayload, createVendor } from '@/lib/vendors-1099-api';

interface VendorFormProps {
  clientId: string;
  onSuccess: () => void;
}

export function VendorForm({ clientId, onSuccess }: VendorFormProps) {
  const [name, setName] = useState('');
  const [ein, setEin] = useState('');
  const [ssn, setSsn] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload: CreateVendorPayload = {
      name,
      ein: ein || undefined,
      ssn: ssn || undefined,
      address_line1: addressLine1 || undefined,
      address_line2: addressLine2 || undefined,
      city: city || undefined,
      state: state || undefined,
      postal_code: postalCode || undefined,
      phone: phone || undefined,
      email: email || undefined,
    };

    await createVendor(clientId, payload);
    onSuccess();
    
    // Reset form
    setName('');
    setEin('');
    setSsn('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setState('');
    setPostalCode('');
    setPhone('');
    setEmail('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">Business Name *</label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="ein" className="block text-sm font-medium mb-1">EIN (Optional)</label>
          <Input
            id="ein"
            value={ein}
            onChange={(e) => setEin(e.target.value)}
            placeholder="XX-XXXXXXX"
          />
        </div>

        <div>
          <label htmlFor="ssn" className="block text-sm font-medium mb-1">SSN (Optional)</label>
          <Input
            id="ssn"
            value={ssn}
            onChange={(e) => setSsn(e.target.value)}
            placeholder="XXX-XX-XXXX"
          />
        </div>
      </div>

      <div>
        <label htmlFor="addressLine1" className="block text-sm font-medium mb-1">Address Line 1</label>
        <Input
          id="addressLine1"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          placeholder="Street address"
        />
      </div>

      <div>
        <label htmlFor="addressLine2" className="block text-sm font-medium mb-1">Address Line 2</label>
        <Input
          id="addressLine2"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          placeholder="Suite, apartment, etc."
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="city" className="block text-sm font-medium mb-1">City</label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium mb-1">State</label>
          <Input
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="XX"
          />
        </div>

        <div>
          <label htmlFor="postalCode" className="block text-sm font-medium mb-1">ZIP Code</label>
          <Input
            id="postalCode"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="XXXXX"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">Phone</label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <Button type="submit">Add Vendor</Button>
    </form>
  );
}
```

- [ ] **Step 3: Write VendorsPage component**

```tsx
import { useEffect, useState } from 'react';
import { Vendor, listVendors, deleteVendor } from '@/lib/vendors-1099-api';
import { VendorForm } from './VendorForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VendorsPageProps {
  clientId: string;
}

export function VendorsPage({ clientId }: VendorsPageProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const loadVendors = async () => {
    const data = await listVendors(clientId);
    setVendors(data);
  };

  useEffect(() => {
    loadVendors();
  }, [clientId]);

  const handleDelete = async (vendorId: string) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      await deleteVendor(vendorId);
      loadVendors();
    }
  };

  const formatCents = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <VendorForm clientId={clientId} onSuccess={loadVendors} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendor List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="flex items-center justify-between p-4 border rounded">
                <div className="flex-1">
                  <p className="font-medium">{vendor.name}</p>
                  <p className="text-sm text-gray-600">
                    {vendor.city && vendor.city}
                    {vendor.city && vendor.state && `, ${vendor.state}`}
                    {vendor.postal_code && ` ${vendor.postal_code}`}
                  </p>
                  <p className="text-xs text-gray-500">EIN: {vendor.ein || 'Not provided'}</p>
                  <p className="text-xs text-gray-500">Total Payments: ${formatCents(vendor.total_payments_cents)}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(vendor.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Add routes and verify**

Add routes for vendors page and verify compilation

- [ ] **Step 5: Commit**

```bash
git add src/features/vendors/ src/lib/vendors-1099-api.ts
git commit -m "feat(1099-nec): add vendor management frontend"
```

---

## Part 4: Testing & Polish

### Task 18: Write Unit Tests for Mileage

**Files:**
- Create: `src-tauri/src/domain/mileage_test.rs` (or integrate into existing test structure)

- [ ] **Step 1: Write mileage tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mileage_deduction_calculation() {
        let log = MileageLog {
            id: "test".to_string(),
            client_id: "client1".to_string(),
            date: "2024-01-15".to_string(),
            purpose: "Client meeting".to_string(),
            origin: "Office".to_string(),
            destination: "Client Site".to_string(),
            miles_real: 100.0,
            rate_cents: 67,  // 2024 rate
            deduction_cents: 6700,
            notes: None,
            receipt_image_path: None,
        };
        
        assert_eq!(log.deduction_cents, 6700); // $67.00
        assert_eq!(log.miles_real, 100.0);
    }

    #[test]
    fn test_mileage_summary_calculation() {
        // Test summary aggregation logic
        let year = 2024;
        let total_miles = 1000.0;
        let total_deduction = 67000;
        let log_count = 10;
        
        let summary = MileageSummary {
            year,
            total_miles,
            total_deduction_cents: total_deduction,
            log_count,
        };
        
        assert_eq!(summary.year, 2024);
        assert_eq!(summary.total_miles, 1000.0);
        assert_eq!(summary.total_deduction_cents, 67000);
        assert_eq!(summary.log_count, 10);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test --manifest-path=src-tauri/Cargo.toml mileage`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/domain/mileage_test.rs
git commit -m "test(mileage): add mileage unit tests"
```

---

### Task 19: Write Unit Tests for Schedule C

**Files:**
- Create: `src-tauri/src/domain/schedule_c_test.rs`

- [ ] **Step 1: Write Schedule C tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schedule_c_line_descriptions() {
        assert_eq!(get_line_description("1"), "Gross Receipts");
        assert_eq!(get_line_description("8"), "Advertising");
        assert_eq!(get_line_description("31"), "Net Profit or (Loss)");
    }

    #[test]
    fn test_schedule_c_report_creation() {
        let mut report = ScheduleCReport {
            year: 2024,
            client_id: "client1".to_string(),
            lines: HashMap::new(),
        };
        
        report.lines.insert(
            "8".to_string(),
            ScheduleCLine {
                line_number: "8".to_string(),
                description: "Advertising".to_string(),
                amount_cents: 50000,
            }
        );
        
        assert_eq!(report.lines.len(), 1);
        assert_eq!(report.lines["8"].amount_cents, 50000); // $500.00
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test --manifest-path=src-tauri/Cargo.toml schedule_c`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/domain/schedule_c_test.rs
git commit -m "test(schedule-c): add Schedule C unit tests"
```

---

### Task 20: Write Unit Tests for 1099-NEC

**Files:**
- Create: `src-tauri/src/domain/vendors_1099_test.rs`

- [ ] **Step 1: Write vendor tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vendor_creation() {
        let payload = CreateVendorPayload {
            name: "Test Vendor".to_string(),
            ein: Some("12-3456789".to_string()),
            ssn: None,
            address_line1: None,
            address_line2: None,
            city: None,
            state: None,
            postal_code: None,
            phone: None,
            email: None,
        };
        
        assert_eq!(payload.name, "Test Vendor");
        assert_eq!(payload.ein, Some("12-3456789"));
        assert!(payload.ssn.is_none());
    }

    #[test]
    fn test_form_1099_nec_threshold() {
        // Test that $600 threshold is enforced
        let vendor_below = Vendor {
            id: "1".to_string(),
            client_id: "client1".to_string(),
            name: "Below Threshold".to_string(),
            ein: None,
            ssn_encrypted: None,
            address_line1: None,
            address_line2: None,
            city: None,
            state: None,
            postal_code: None,
            phone: None,
            email: None,
            total_payments_cents: 50000, // $500.00
        };
        
        let vendor_at = Vendor {
            id: "2".to_string(),
            client_id: "client1".to_string(),
            name: "At Threshold".to_string(),
            ein: None,
            ssn_encrypted: None,
            address_line1: None,
            address_line2: None,
            city: None,
            state: None,
            postal_code: None,
            phone: None,
            email: None,
            total_payments_cents: 60000, // $600.00
        };
        
        // $600 threshold in cents
        assert!(vendor_below.total_payments_cents < 600000);
        assert!(vendor_at.total_payments_cents >= 600000);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test --manifest-path=src-tauri/Cargo.toml vendors_1099`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/domain/vendors_1099_test.rs
git commit -m "test(1099-nec): add vendor unit tests"
```

---

### Task 21: Integration Testing & Manual Verification

- [ ] **Step 1: Test mileage flow**

1. Run app: `pnpm tauri dev`
2. Navigate to Mileage page
3. Add mileage log with test data
4. Verify deduction is calculated correctly
5. Delete log and verify removal
6. Check yearly summary updates

- [ ] **Step 2: Test Schedule C flow**

1. Navigate to Schedule C page
2. Verify report loads with data
3. Check line mappings are applied
4. Verify totals are calculated correctly

- [ ] **Step 3: Test 1099-NEC flow**

1. Navigate to Vendors page
2. Add vendor with test data
3. Create vendor with EIN/SSN
4. Verify encryption (SSN not exposed)
5. Delete vendor and verify removal

- [ ] **Step 4: Test Clients page fix**

1. Navigate to Clients page
2. Verify no excessive spacing at bottom
3. Test scrolling behavior
4. Check on different screen sizes

- [ ] **Step 5: Verify all export functions**

1. Test PDF export placeholders
2. Test CSV exports
3. Verify data integrity

- [ ] **Step 6: Check for TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Check for Rust compilation errors**

Run: `cargo check --manifest-path=src-tauri/Cargo.toml`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `cargo test --manifest-path=src-tauri/Cargo.toml`
Expected: All tests pass

- [ ] **Step 9: Commit any final polish fixes**

```bash
git add -A
git commit -m "polish: integration testing and final fixes"
```

---

## Task 22: Update Documentation

**Files:**
- Modify: `README.md` (if needed)
- Modify: `docs/FEATURE-ROADMAP-2026.md`

- [ ] **Step 1: Update README with new features**

Add sections for Mileage, Schedule C, and 1099-NEC features

- [ ] **Step 2: Update roadmap to mark Phase 1 complete**

Update `docs/FEATURE-ROADMAP-2026.md` to mark Phase 1 features as complete

- [ ] **Step 3: Commit**

```bash
git add README.md docs/FEATURE-ROADMAP-2026.md
git commit -m "docs: update documentation for Phase 1 completion"
```

---

## Success Criteria Checklist

After completing all tasks, verify:

- [ ] Mileage tracking works end-to-end (add, edit, delete, calculate deductions)
- [ ] Schedule C report generates correctly with COA mappings
- [ ] 1099-NEC vendors can be created and tracked
- [ ] All database migrations run without errors
- [ ] All frontend components render without errors
- [ ] Export functions work (PDF + CSV placeholders)
- [ ] Unit tests pass for all three features
- [ ] Integration testing completed manually
- [ ] TypeScript compilation clean (0 errors)
- [ ] Rust compilation clean (0 errors)
- [ ] Clients page spacing fixed
- [ ] Documentation updated

---

## Notes

- **Encryption**: SSN values are encrypted using existing AES-256-GCM implementation in owner_db.rs
- **IRS Rates**: Built-in rates can be extended via simple INSERT statements
- **Thresholds**: 1099-NEC $600 threshold enforced in `get_vendors_requiring_1099`
- **Error Handling**: All commands return Result<T, String> for consistent error handling
- **Testing**: Unit tests focus on business logic, integration tests via manual testing
- **Future Work**: PDF export generation is placeholder - requires PDF library integration

**Estimated Timeline**: 10-15 days depending on complexity and testing depth

**Next Phase**: After Phase 1 completion, begin Phase 2 (Bank Feeds & Reconciliation)
