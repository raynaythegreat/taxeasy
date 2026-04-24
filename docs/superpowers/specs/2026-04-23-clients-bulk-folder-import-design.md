# Clients Bulk Folder Import Design

**Date:** 2026-04-23
**Status:** Approved
**Priority:** High

## Overview

Add a bulk folder import flow on the Clients page that creates client profiles from selected folder names, stores each client's source folder path, imports supported files from each folder into that client's Documents list, and skips duplicates by name.

## Goals

1. Let users select many folders at once from the Clients page.
2. Create one client per folder using the folder name as the client name.
3. Default imported clients to `1040 Individual`.
4. Persist the selected source folder path on each client.
5. Import supported files from each folder into Documents during the same operation.
6. Skip duplicate names instead of renaming or merging them.
7. Return a clear per-folder summary so one bad folder does not abort the whole batch.
8. Keep `/Users/ray/Documents/Taxeasy` as the source repo and sync the verified result into `/Users/ray/Documents/Taxeasy 2.0`.

## Architecture

### Source Of Truth

- Primary repo: `/Users/ray/Documents/Taxeasy`
- Secondary local copy to sync after verification: `/Users/ray/Documents/Taxeasy 2.0`

### Data Model

Add a new nullable `source_folder_path` column to the app-level `clients` table.

This path is the canonical folder selected by the user for that client. It is separate from per-document file paths so Taxeasy can support future re-sync or folder health checks without deriving a root from individual documents.

### Bulk Import Flow

```
Clients Page
  -> Tauri folder picker (`directory: true`, `multiple: true`)
  -> `bulk_import_client_folders` command
  -> per folder:
       normalize folder name
       check duplicate name against active clients
       create client with `i1040` entity type
       save `source_folder_path`
       scan files recursively
       add supported files to Documents
  -> return created / skipped / failed summary
  -> refresh clients list and show import results
```

## Backend Design

### Schema

Add a migration that updates `clients` with:

```sql
ALTER TABLE clients ADD COLUMN source_folder_path TEXT;
```

### Domain Types

Extend `Client` and `CreateClientPayload` with `source_folder_path`.

Add bulk import payload and result types, for example:

```rust
pub struct BulkImportClientFoldersPayload {
    pub folder_paths: Vec<String>,
}

pub struct BulkImportClientFoldersResult {
    pub created: Vec<BulkImportedClient>,
    pub skipped: Vec<BulkImportSkip>,
    pub failed: Vec<BulkImportFailure>,
}
```

Each created result should include the new client id, resolved name, folder path, and imported document count.

### Command Behavior

Add one new Tauri command to own the whole batch import. It should:

1. Reject empty batches early.
2. Normalize folder paths and derive client names from the last path segment.
3. Skip any folder whose derived name matches an existing active client name case-insensitively.
4. Reuse the normal client creation path so seeding, encryption, and active-client behavior stay consistent.
5. Persist `source_folder_path` when the client is created.
6. Walk the selected folder recursively and import supported document types.
7. Continue after per-folder errors and collect them in the result payload.

### File Import Rules

Reuse the same supported document extensions already accepted by the Documents feature.

For each discovered file, add a document record using:

- `file_name`: basename
- `file_path`: absolute source path
- `description`: optional, unset by default
- `category`: existing default behavior

The first version should avoid deduplicating files inside the same folder import beyond the current database constraints. If duplicate file handling becomes noisy, add a follow-up hash or path-based dedupe pass later.

## Frontend Design

### Clients Page

Add an `Import Folders` action near `New` in the expanded and collapsed sidebar states.

The action should:

1. Open the native folder picker.
2. Pass all selected folders to the new bulk import command.
3. Disable repeated submissions while the import is running.
4. Show a summary banner or panel after completion with counts for created, skipped, failed, and imported documents.
5. Refresh the clients query after success.

### Client Editing

Expose the saved source folder path in the existing client edit modal so users can inspect or correct it later.

The first version only needs editable text storage. A richer “re-pick folder” action can come later.

### UX Rules

1. Default imported clients to `1040 Individual` with no extra prompt.
2. Keep manual client creation unchanged.
3. If the user cancels the picker, do nothing and show no error.
4. If part of the batch fails, keep successful imports and show the failures.

## Error Handling

### Skip Conditions

- Duplicate active client name
- Empty or invalid folder name

### Failure Conditions

- Folder path no longer exists
- Client creation error
- Recursive scan error
- Document insert error severe enough to fail the folder import result

The command should prefer partial success. A failed file import inside one folder may either count as a folder failure or return a reduced document count with warnings, but the implementation must be consistent and surfaced clearly in the result payload.

## Testing

### Backend

Add Rust tests for:

1. Client creation with `source_folder_path`
2. Duplicate-name skip behavior
3. Bulk import with multiple folders
4. Recursive document import count
5. Partial failure handling when one folder is invalid

### Frontend

Add targeted UI tests for:

1. Import button launches the flow
2. Pending state disables repeated clicks
3. Summary UI renders created, skipped, and failed counts
4. Client edit modal displays the saved folder path

## Sync Plan

After verification passes in `/Users/ray/Documents/Taxeasy`, sync the changed source files into `/Users/ray/Documents/Taxeasy 2.0` so both local app copies contain the same feature set.

Exclude generated directories during sync, especially `node_modules`, `dist`, and `src-tauri/target`.

## Recommended Follow-Ups

1. Add a “Re-sync Folder” action per client.
2. Add folder health warnings when the saved path is missing.
3. Add optional auto-categorization rules for imported files by filename.
4. Add hash-based document dedupe if repeated imports become common.
