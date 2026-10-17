# CodeRenew

## Overview

**CodeRenew** is an AI-powered desktop application for modernizing legacy codebases. It performs multi-language code conversion, comprehensive security analysis with persistent history, audits entire GitHub repositories for vulnerabilities, and includes a **Recovery Loop** agent that continuously monitors customer repositories — automatically detecting issues and creating pull requests with fixes.

## Features

* **Code Conversion** — AI-powered multi-language code conversion and modernization. Supports Python, Java, C++, JavaScript, TypeScript, C#, and Ruby.
* **GitHub Clone & Convert** — Clone a GitHub repo, bulk-convert all matching files, and push the result to a new branch.
* **AI Security Scanner** — Tabbed interface separating:
  * **File Scan** — Scan individual files from conversions or standalone uploads. Results are persisted in a local SQLite database with full scan history.
  * **Repo Audit** — Clone and audit entire GitHub repositories for security vulnerabilities. Runs as a background process with real-time progress tracking. Supports scheduled recurring audits (daily/weekly).
* **Knowledge Graph** — Generates an interactive dependency/relationship graph of a codebase using AI analysis.
* **Recovery Loop** — Continuous monitoring agent: customers provide repo access, the agent polls for changes, detects legacy patterns and security issues, auto-generates fixes, and opens pull requests automatically.
* **Dashboard** — Aggregated overview with conversion stats, security severity breakdown (High/Medium/Low bars), standards compliance pills (HIPAA, ISO 27001, General), quick-start actions, recent activity feed, and a full conversion history table.
* **Summary Report** — Detailed report of all conversion and security findings with export options.
* **ChatBot** — In-app AI assistant for code-related queries.
* **SQLite Persistence** — Scan history, repo audit results, and scheduled audit configurations are stored in a local `coderenew.db` database that survives app restarts.
* **Secure Credential Storage** — API keys and GitHub tokens are stored securely via a Rust-based `api_manager` CLI binary.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | [React](https://reactjs.org/) · [TypeScript](https://www.typescriptlang.org/) · [Vite](https://vitejs.dev/) · [Tailwind CSS](https://tailwindcss.com/) · [shadcn/ui](https://ui.shadcn.com/) · [Recharts](https://recharts.org/) |
| **Backend** | [Flask](https://flask.palletsprojects.com/) · [Python 3](https://www.python.org/) · [Groq API](https://groq.com/) (Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B, Gemma2 9B) |
| **Database** | [SQLite](https://www.sqlite.org/) (local, zero-config persistence) |
| **Desktop** | [Electron](https://www.electronjs.org/) |
| **Credential Manager** | [Rust](https://www.rust-lang.org/) CLI (`api_manager`) |
| **Libraries** | lib2to3 · GitPython · NetworkX · Flask-CORS |

## Getting Started

### Prerequisites

* **Node.js** (v18+) and npm/bun
* **Python 3.10+** with pip
* **Rust & Cargo** (only if rebuilding the `api_manager` binary)
* A **Groq API key** (free tier available at [console.groq.com](https://console.groq.com))
* A **GitHub personal access token** (for private repos and PR creation)

### Installation

```sh
# 1. Clone the repository
git clone https://github.com/kronten28/legacycodemodernizer.git
cd legacycodemodernizer

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
pip install -r backend/requirements.txt

# 4. Start the backend API server
cd backend && python api.py &

# 5. Start the desktop app (Electron + Vite)
cd .. && npm run dev
```

### Configuration

On first launch, go to **Settings** in the app and enter your:
1. **Groq API Key** — enables AI-powered conversion and security scanning.
2. **GitHub Token** — enables cloning private repos and creating PRs from the Recovery Loop.

Keys are stored locally via the `api_manager` binary and never leave your machine.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                Electron Desktop                  │
│  ┌────────────────────────────────────────────┐  │
│  │   React Frontend (Vite + Tailwind)         │  │
│  │   ├── Dashboard        (stats + history)   │  │
│  │   ├── Code Workspace   (convert files)     │  │
│  │   ├── Clone & Convert  (GitHub repos)      │  │
│  │   ├── Security Scanner                     │  │
│  │   │   ├── File Scan    (upload + history)  │  │
│  │   │   └── Repo Audit   (clone + schedule)  │  │
│  │   ├── Recovery Loop    (monitor agent)     │  │
│  │   ├── Knowledge Graph  (dependency viz)    │  │
│  │   ├── Summary Report   (export PDF/CSV)    │  │
│  │   ├── Settings         (API keys)          │  │
│  │   └── ChatBot          (AI assistant)      │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │ HTTP (localhost:5000)            │
│  ┌──────────────▼─────────────────────────────┐  │
│  │   Flask Backend                            │  │
│  │   ├── translate.py       (conversion)      │  │
│  │   ├── security_check.py  (AI scanner)      │  │
│  │   ├── clone_convert.py   (GitHub ops)      │  │
│  │   ├── knowledge_graph.py (dep graph)       │  │
│  │   ├── recovery_loop.py   (monitor agent)   │  │
│  │   ├── repo_audit.py      (repo scanning)   │  │
│  │   ├── database.py        (SQLite layer)    │  │
│  │   └── api_manager/       (Rust creds)      │  │
│  └──────────┬──────────────┬──────────────────┘  │
│             │              │                      │
│  ┌──────────▼──────┐ ┌────▼───────────────────┐  │
│  │  SQLite (local)  │ │ Groq API (AI Models)   │  │
│  │  coderenew.db    │ │ Llama 3.3 70B, etc.    │  │
│  └─────────────────┘ └────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## How It Works

### Code Conversion
1. **Parse & analyze** — The source code is parsed and analyzed for language patterns and modernization opportunities.
2. **AI conversion** — The Groq-hosted LLM converts the code to the target language, adds type hints, modernizes idioms, and cleans up artifacts.
3. **Security scan** — The converted code is analyzed for vulnerabilities with severity ratings and fix suggestions.

### Security Scanner

The Security Scanner has two modes accessible via tabbed navigation:

**File Scan:**
1. View security findings from the latest conversion automatically.
2. Or upload standalone files for independent scanning.
3. Filter by compliance standard (HIPAA, ISO 27001, General).
4. All results are persisted in SQLite with full history.

**Repo Audit:**
1. Enter a GitHub repository URL to trigger a full security audit.
2. The backend clones the repo, identifies scannable files, and processes them in a background thread.
3. Real-time progress is shown via polling (file count, current file, issues found so far).
4. Issues are grouped by file with severity badges and code recommendations.
5. Schedule recurring audits (daily/weekly) that run automatically.

### Recovery Loop
1. User provides a GitHub repo URL and configures poll interval + auto-fix preference.
2. The agent clones the repo, builds a file-hash baseline, and runs an initial scan.
3. A background thread polls for new commits at the configured interval.
4. On each poll: pulls latest changes, detects modified/new files, runs legacy pattern detection and AI security scanning.
5. If auto-fix is enabled, the agent generates remediation code via AI and creates a pull request with the fixes.
6. All activity is streamed to a real-time event log in the frontend.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/migrate` | Legacy code modernization |
| POST | `/convert` | Multi-language code conversion |
| POST | `/github/clone` | Clone a GitHub repo |
| POST | `/github/bulk-convert` | Bulk convert files in a cloned repo |
| POST | `/github/push-branch` | Push converted files to a new branch |
| POST | `/analyze/knowledge-graph` | Generate knowledge graph |
| POST | `/recovery/start` | Start monitoring a repo |
| POST | `/recovery/stop` | Stop monitoring |
| GET | `/recovery/status` | Get all monitor statuses |
| GET | `/recovery/events` | Get agent event log |
| GET | `/recovery/issues` | Get detailed scan issues |
| POST | `/recovery/scan` | Trigger an immediate scan |
| POST | `/api/security/scan-files` | Standalone file security scan |
| POST | `/api/security/scan-repo` | Start async repository audit |
| GET | `/api/security/audit-status` | Poll repo audit progress |
| POST | `/api/security/schedule-audit` | Schedule recurring audit |
| POST | `/api/security/cancel-schedule` | Cancel a scheduled audit |
| GET | `/api/security/history` | Retrieve scan/audit history |
| GET | `/api/security/scan-detail` | Get full results for a scan |
| GET | `/api/security/schedules` | List scheduled audits |

## Project Structure

```
├── backend/
│   ├── api.py                # Flask API server (all endpoints)
│   ├── translate.py          # AI code conversion
│   ├── security_check.py     # AI security scanner
│   ├── clone_convert.py      # GitHub repo operations
│   ├── knowledge_graph.py    # Dependency graph builder
│   ├── recovery_loop.py      # Continuous monitoring agent
│   ├── repo_audit.py         # Background repo security auditing
│   ├── database.py           # SQLite persistence layer
│   ├── coderenew.db          # SQLite database (auto-created)
│   ├── requirements.txt      # Python dependencies
│   ├── tests/                # Backend test suite
│   └── api_manager/          # Rust credential manager
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx         # Stats, security overview, history table
│   │   ├── CodeWorkspace.tsx     # File conversion workspace
│   │   ├── CloneConvert.tsx      # GitHub clone & convert
│   │   ├── SecurityScanner.tsx   # Tabbed container (File Scan / Repo Audit)
│   │   ├── FileSecurityScan.tsx  # File-level scan + history
│   │   ├── RepoSecurityAudit.tsx # Repo audit + scheduling
│   │   ├── RecoveryLoop.tsx      # Continuous monitoring UI
│   │   ├── KnowledgeGraph.tsx    # Dependency visualization
│   │   ├── SummaryReport.tsx     # Aggregated report
│   │   ├── Settings.tsx          # API key configuration
│   │   ├── ChatBot.tsx           # AI assistant
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Layout.tsx            # App layout wrapper
│   │   ├── ApiHealthBadge.tsx    # API status indicator
│   │   └── ui/                   # shadcn/ui components
│   ├── context/
│   │   └── AppContext.tsx        # Global state management
│   ├── lib/
│   │   └── exportUtils.ts       # CSV/PDF export utilities
│   └── App.tsx                   # Router
├── electron/
│   ├── main.ts
│   └── preload.ts
├── .github/
│   └── workflows/ci.yml         # CI pipeline
└── package.json
```

## License

This project is part of an academic submission (8th Semester Final Year Project).

## Quality Gates

Run these commands before submission:

```sh
npm run lint
npm run test
npm run build:web
```

### Test Coverage Scope

Current automated checks focus on high-signal paths:

* Frontend utility behavior (`cn` class merge logic)
* Backend endpoint contract checks for:
	* `/api/health`
	* `/convert` bad input and invalid mode handling
	* `/migrate` bad input handling

## CI Pipeline

A GitHub Actions workflow is included at `.github/workflows/ci.yml`.

On each push and pull request to `main` or `master`, the pipeline runs:

1. Dependency installation (Node + Python)
2. Lint (`npm run lint`)
3. Frontend tests (`npm run test:frontend`)
4. Backend smoke tests (`npm run test:backend`)
5. Frontend production build (`npm run build:web`)

## Requirement Traceability (Submission Quick View)

| Requirement Area | Implementation Evidence |
|------------------|-------------------------|
| Multi-language code modernization | `/migrate`, `/convert` endpoints in `backend/api.py` |
| Multi-file / repository processing | `/github/clone`, `/github/bulk-convert`, `/github/push-branch` in `backend/api.py` |
| Security assessment | `backend/security_check.py`, `backend/repo_audit.py`, Security Scanner UI (File Scan + Repo Audit tabs) |
| Data persistence | `backend/database.py`, SQLite `coderenew.db` for scan history, audit results, schedules |
| Continuous monitoring agent | `backend/recovery_loop.py`, `/recovery/*` endpoints |
| Scheduled security auditing | `backend/repo_audit.py`, `/api/security/schedule-audit` endpoint |
| Knowledge graph analysis | `backend/knowledge_graph.py`, `/analyze/knowledge-graph` |
| Desktop productization | Electron entrypoints in `electron/main.ts`, `dist-electron/main.cjs` |
| Verification and reliability | Test files in `src/lib/utils.test.ts` and `backend/tests/test_api_smoke.py`, CI in `.github/workflows/ci.yml` |

## Known Limitations

* AI output quality depends on prompt/model behavior and may vary by language complexity.
* Security findings are AI-assisted and should be validated in code review.
* The SQLite database is local-only and not designed for multi-user or networked deployments.
* Current automated tests are intentionally compact for fast iteration and should be expanded for full release QA.
