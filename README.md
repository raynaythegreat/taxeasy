# Taxeasy

**Local-first, IRS-ready double-entry bookkeeping for small businesses.**

Built with [Tauri 2](https://v2.tauri.app/), React 19, TypeScript, Tailwind CSS 4, and SQLite (SQLCipher encrypted).

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Double-entry ledger** — Every transaction balances debits and credits
- **Chart of Accounts** — Pre-seeded COA with Schedule C line mappings for sole proprietors
- **Client management** — Multiple clients/businesses, each with their own encrypted database
- **Invoices & Receipts** — Create invoices, receipts, and estimates with line items and tax
- **Reports** — Profit & Loss, Balance Sheet, Cash Flow (fiscal-year aware)
- **AI categorization** — Auto-categorize transactions using Ollama or LM Studio (local, private)
- **Receipt scanning** — Scan receipts via GLM-OCR
- **CSV export** — Export transactions and reports to CSV
- **Backup & Restore** — Full database backup/restore
- **Dark mode** — Light, dark, and system theme support
- **Encrypted storage** — AES-256-GCM field encryption, SQLCipher databases
- **Keyboard shortcuts** — Quick navigation with keyboard shortcuts

## Screenshots

> Coming soon

## Prerequisites

### All Platforms

| Dependency | Version | Install |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 18 | `brew install node` / `winget install OpenJS.NodeJS` / `nvm install 18` |
| [pnpm](https://pnpm.io/) | >= 8 | `npm install -g pnpm` |
| [Rust](https://www.rust-lang.org/tools/install) | >= 1.77 | See platform-specific instructions below |
| [Tauri CLI](https://v2.tauri.app/start/prerequisites/) | v2 | Installed automatically via pnpm |

### macOS

```bash
xcode-select --install
rustup-init
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux (Fedora)

```bash
sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux (Arch)

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel openssl curl wget file libappindicator-gtk3
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Windows

```powershell
# Install Rust via rustup
winget install Rustlang.Rustup
# Or download from https://rustup.rs/

# Install Visual Studio Build Tools (required for Rust on Windows)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.NativeDesktop --includeRecommended"
```

## Install & Run

```bash
# Clone the repo
git clone https://github.com/raydev/taxeasy.git
cd taxeasy

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

The app will compile the Rust backend and open a development window. First launch will ask you to set a passphrase — this encrypts all your data.

## Build for Production

```bash
pnpm tauri build
```

This produces platform-native installers:

| Platform | Output |
|---|---|
| macOS | `src-tauri/target/release/bundle/dmg/Taxeasy_0.1.0_aarch64.dmg` |
| macOS (Intel) | `src-tauri/target/release/bundle/dmg/Taxeasy_0.1.0_x64.dmg` |
| Windows | `src-tauri/target/release/bundle/msi/Taxeasy_0.1.0_x64-setup.msi` |
| Linux | `src-tauri/target/release/bundle/deb/taxeasy_0.1.0_amd64.deb` |
| Linux | `src-tauri/target/release/bundle/appimage/taxeasy_0.1.0_amd64.AppImage` |

## Optional: AI Features

Taxeasy can use local AI models for transaction categorization and natural-language queries.

### Ollama (recommended)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5:7b-instruct

# Start the server
ollama serve
```

Then in Taxeasy: Settings → AI Configuration → set Server URL to `http://localhost:11434` and click Test.

### LM Studio

1. Download [LM Studio](https://lmstudio.ai/)
2. Load a model (e.g., Qwen 2.5 7B Instruct)
3. Start the local server (default: `http://localhost:1234`)
4. In Taxeasy: Settings → AI Configuration → set Server URL to `http://localhost:1234`

### GLM-OCR (Receipt Scanning)

Install the GLM-OCR binary and set the path in Settings → AI Configuration.

## Project Structure

```
taxeasy/
├── src/                          # React frontend
│   ├── components/               # Shared components (AppShell, Dashboard, etc.)
│   ├── features/                 # Feature modules
│   │   ├── accounts/             # Chart of Accounts management
│   │   ├── clients/              # Client management
│   │   ├── invoices/             # Invoices, receipts, estimates
│   │   ├── reports/              # P&L, Balance Sheet, Cash Flow views
│   │   ├── settings/             # App settings
│   │   ├── transactions/         # Ledger, forms, import wizard
│   │   └── unlock/               # Passphrase unlock screen
│   └── lib/                      # API helpers, utils, contexts
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── ai/                   # Ollama, LM Studio, GLM-OCR integrations
│   │   ├── commands/             # Tauri IPC command handlers
│   │   ├── db/                   # Database layer (SQLCipher, encryption)
│   │   ├── domain/               # Domain types (Account, Transaction, Client)
│   │   ├── migrations/           # SQL schema migrations
│   │   └── reports/              # Financial report generators
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, TanStack Query |
| Desktop | Tauri 2 (Rust-based, ~10MB binary) |
| Database | SQLite via rusqlite with SQLCipher encryption |
| Money | rust_decimal (integer cents, never float) |
| Encryption | AES-256-GCM, Argon2 key derivation |
| AI | Ollama / LM Studio (local, no cloud) |

## License

MIT
