# CodeRenew

AI-powered desktop application for modernizing legacy codebases. Built with React + TypeScript (Electron) frontend and a Python Flask backend powered by **Vertex AI (Gemini 1.5 Pro)** on Google Cloud.

Submitted for: **Google Cloud AI Builder Cup 2025**

> All AI inference runs on Vertex AI via Application Default Credentials. No third-party API keys are required.

---

## What It Does

| Feature | Description |
|---|---|
| Code Conversion | Translate code between Python, Java, C++, JavaScript, TypeScript, C#, Ruby |
| GitHub Clone & Convert | Clone a repo, bulk-convert all matching files, push to a new branch |
| Security Scanner | File-level scan and full repo audit with severity ratings and fix suggestions |
| Recovery Loop | Continuous monitoring agent — polls a repo, detects issues, opens PRs automatically |
| Knowledge Graph | Interactive dependency visualization of a codebase using NetworkX |
| Dashboard | Conversion stats, security severity breakdown, full scan history |
| ChatBot | In-app assistant powered by Gemini 1.5 Pro |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Google Cloud project with **Vertex AI API enabled**
- `gcloud` CLI installed and authenticated
- Git

### 1. Authenticate with Google Cloud

```bash
gcloud auth application-default login
gcloud config set project YOUR_GCP_PROJECT_ID
```

This sets up Application Default Credentials (ADC) so the backend can call Vertex AI without any API key.

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` folder:

```env
GCP_PROJECT=your-gcp-project-id
GCP_LOCATION=us-central1
VERTEX_MODEL=gemini-1.5-pro
FRONTEND_ORIGIN=http://localhost:5173
```

Start the Flask server:

```bash
python api.py
```

The API runs on `http://localhost:5000` by default.

### 3. Frontend (Web Dev Mode)

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Frontend (Electron Desktop App)

```bash
npm install
npm run build:electron
npm run electron
```

---

## GCP Services Used

| Service | Purpose |
|---|---|
| Vertex AI (Gemini 1.5 Pro) | All AI inference — code conversion, security scanning, chatbot |
| Cloud Run | Backend deployment (containerized Flask) |
| Cloud Firestore | Scan history, audit results, conversion records |
| Cloud Storage | Temporary cloned repository files |
| Cloud Tasks + Scheduler | Async repo audits and cron-based recurring audits |
| Secret Manager | GitHub tokens stored securely |
| Firebase Hosting | React SPA hosting |
| Cloud Build | CI/CD pipeline |

---

## Project Structure

```
backend/
    api.py                  Flask API server — all endpoints
    translate.py            AI code conversion (Vertex AI)
    security_check.py       AI security scanner (Vertex AI)
    clone_convert.py        GitHub repo clone and bulk conversion
    knowledge_graph.py      Dependency graph builder (NetworkX)
    recovery_loop.py        Continuous monitoring agent
    repo_audit.py           Background repo security auditing
    database.py             SQLite persistence layer
    coderenew.db            SQLite database (auto-created on first run)
    requirements.txt        Python dependencies
    tests/
        conftest.py
        test_api_smoke.py   Backend smoke tests
    api_manager/            Rust CLI binary for secure credential storage
        src/main.rs
        Cargo.toml

src/
    components/
        Dashboard.tsx           Stats, security overview, history table
        CodeWorkspace.tsx       File conversion workspace
        CloneConvert.tsx        GitHub clone and convert
        SecurityScanner.tsx     Tabbed container (File Scan / Repo Audit)
        FileSecurityScan.tsx    File-level scan and history
        RepoSecurityAudit.tsx   Repo audit and scheduling
        RecoveryLoop.tsx        Continuous monitoring UI
        KnowledgeGraph.tsx      Dependency visualization
        SummaryReport.tsx       Aggregated report
        Settings.tsx            GCP and GitHub configuration
        ChatBot.tsx             Gemini-powered assistant
        Sidebar.tsx             Navigation
        Layout.tsx              App layout wrapper
        ApiHealthBadge.tsx      API status indicator
        ui/                     shadcn/ui base components
    context/
        AppContext.tsx           Global state
    lib/
        exportUtils.ts          CSV / PDF export
        utils.ts
    App.tsx                     Router

electron/
    main.ts
    preload.ts

.github/
    workflows/ci.yml            GitHub Actions CI pipeline
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check and Vertex AI configuration status |
| POST | `/migrate` | Legacy code migration and modernization |
| POST | `/convert` | Multi-language code conversion |
| POST | `/github/clone` | Clone a GitHub repository |
| POST | `/github/bulk-convert` | Bulk convert all matching files in a cloned repo |
| POST | `/github/push-branch` | Push converted files to a new branch |
| POST | `/analyze/knowledge-graph` | Generate a dependency knowledge graph |
| POST | `/recovery/start` | Start continuous monitoring on a repo |
| POST | `/recovery/stop` | Stop monitoring |
| GET | `/recovery/status` | Get all active monitor statuses |
| GET | `/recovery/events` | Get the real-time agent event log |
| GET | `/recovery/issues` | Get detailed scan issues found by the agent |
| POST | `/recovery/scan` | Trigger an immediate scan cycle |
| POST | `/api/security/scan-files` | Standalone file security scan |
| POST | `/api/security/scan-repo` | Start an async repository audit |
| GET | `/api/security/audit-status` | Poll audit progress |
| POST | `/api/security/schedule-audit` | Schedule a recurring audit (daily/weekly) |
| POST | `/api/security/cancel-schedule` | Cancel a scheduled audit |
| GET | `/api/security/history` | Retrieve full scan and audit history |
| GET | `/api/security/scan-detail` | Get full results for a specific scan |
| GET | `/api/security/schedules` | List all scheduled audits |
| POST | `/api/chat` | ChatBot powered by Gemini 1.5 Pro |

---

## How Each Feature Works

### Code Conversion

1. User pastes source code and selects source and target language.
2. Frontend calls `POST /convert` (or `POST /migrate` for legacy modernization).
3. Flask calls Vertex AI (Gemini 1.5 Pro) with a structured prompt for code conversion.
4. Converted code is returned and shown in a split-pane editor.
5. The converted code is automatically passed to the security scanner.
6. Security findings are shown with severity ratings and fix suggestions.

### Security Scanner

**File Scan mode:**
- Upload a file or use the output of a conversion.
- Results are persisted in SQLite with full history.
- Filter findings by compliance standard: HIPAA, ISO 27001, General.

**Repo Audit mode:**
- Enter a GitHub repository URL.
- Backend clones the repo and processes files in a background thread.
- Real-time progress shown via polling.
- Issues grouped by file with severity badges and code recommendations.
- Schedule recurring audits at daily or weekly intervals.

### Recovery Loop

1. User provides a GitHub repo URL, poll interval, and auto-fix preference.
2. Backend clones the repo, builds a file-hash baseline, and runs an initial scan.
3. A background thread polls for new commits at the configured interval.
4. On each poll: pulls latest changes, detects modified files, runs security scanning.
5. If auto-fix is enabled, Gemini generates remediation code and opens a GitHub PR.
6. All activity streams to the real-time event log in the frontend.

---

## Running Tests

```bash
# Frontend tests
npm run test

# Backend smoke tests
cd backend
pytest tests/

# Lint
npm run lint

# Production build (web)
npm run build:web
```

### What the tests cover

- Frontend: `cn` class merge utility (`src/lib/utils.test.ts`)
- Backend: `/api/health`, `/convert` (bad input + invalid mode), `/migrate` (bad input)

---

## CI Pipeline

GitHub Actions runs on every push and pull request to `main`:

1. Install Node.js and Python dependencies
2. Lint (`npm run lint`)
3. Frontend tests (`npm run test:frontend`)
4. Backend smoke tests (`npm run test:backend`)
5. Production web build (`npm run build:web`)

---

## Requirement Traceability

| Requirement | Implementation |
|---|---|
| Multi-language code modernization | `/migrate`, `/convert` in `backend/api.py`; `backend/translate.py` (Vertex AI) |
| Multi-file / repository processing | `/github/clone`, `/github/bulk-convert`, `/github/push-branch` |
| Security assessment | `backend/security_check.py` (Vertex AI), `backend/repo_audit.py`, Security Scanner UI |
| Data persistence | `backend/database.py`, SQLite `coderenew.db` |
| Continuous monitoring agent | `backend/recovery_loop.py`, `/recovery/*` endpoints |
| Scheduled security auditing | `backend/repo_audit.py`, `/api/security/schedule-audit` |
| Knowledge graph analysis | `backend/knowledge_graph.py`, `/analyze/knowledge-graph` |
| Desktop app | Electron entrypoints in `electron/main.ts` |
| Testing and CI | `src/lib/utils.test.ts`, `backend/tests/test_api_smoke.py`, `.github/workflows/ci.yml` |
| No third-party API keys | Vertex AI via Application Default Credentials — GCP IAM only |

---

## Known Limitations

- AI output quality depends on Gemini model behavior and may vary with code complexity.
- Security findings are AI-assisted and should be validated in code review.
- The SQLite database is local-only; the GCP deployment version uses Cloud Firestore.
- The Rust `api_manager` binary must be compiled locally before first use: `cargo build --release` inside `backend/api_manager/`.
- Automated tests are intentionally compact for fast iteration.

---

## License

This project is part of an academic submission — AI Builder Cup 2025, Final Year Project.
