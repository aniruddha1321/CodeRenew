"""
Database module for CodeRenew
==============================
SQLite database for persisting security scan results, repo audit history,
and scheduled audits. The DB file lives alongside the backend.
"""

import sqlite3
import os
import json
import uuid
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_SCRIPT_DIR, "coderenew.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS file_scans (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            filenames TEXT NOT NULL,
            total_issues INTEGER DEFAULT 0,
            high_count INTEGER DEFAULT 0,
            medium_count INTEGER DEFAULT 0,
            low_count INTEGER DEFAULT 0,
            results_json TEXT NOT NULL,
            scan_type TEXT DEFAULT 'standalone'
        );

        CREATE TABLE IF NOT EXISTS repo_audits (
            id TEXT PRIMARY KEY,
            repo_url TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL,
            completed_at TEXT,
            total_files INTEGER DEFAULT 0,
            scanned_files INTEGER DEFAULT 0,
            total_issues INTEGER DEFAULT 0,
            high_count INTEGER DEFAULT 0,
            medium_count INTEGER DEFAULT 0,
            low_count INTEGER DEFAULT 0,
            results_json TEXT DEFAULT '[]',
            error TEXT
        );

        CREATE TABLE IF NOT EXISTS scheduled_audits (
            id TEXT PRIMARY KEY,
            repo_url TEXT NOT NULL,
            interval TEXT NOT NULL,
            model TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            last_run TEXT,
            next_run TEXT,
            last_audit_id TEXT
        );

        CREATE TABLE IF NOT EXISTS recovery_sessions (
            monitor_id TEXT PRIMARY KEY,
            repo_url TEXT NOT NULL,
            repo_name TEXT NOT NULL,
            repo_path TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            started_at TEXT NOT NULL,
            stopped_at TEXT,
            poll_interval INTEGER DEFAULT 300,
            model TEXT,
            auto_fix INTEGER DEFAULT 1,
            scans_completed INTEGER DEFAULT 0,
            issues_found INTEGER DEFAULT 0,
            issues_fixed INTEGER DEFAULT 0,
            prs_created INTEGER DEFAULT 0,
            events_json TEXT DEFAULT '[]',
            issues_json TEXT DEFAULT '[]',
            baseline_hashes_json TEXT DEFAULT '{}'
        );
    """)
    conn.commit()
    conn.close()


# ─── File Scans ───

def save_file_scan(filenames: list[str], results: dict, scan_type: str = "standalone") -> str:
    """Save a file scan result. Returns the scan ID."""
    scan_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    all_issues = []
    for issues in results.values():
        all_issues.extend(issues)

    high = sum(1 for i in all_issues if i.get("severity") == "high")
    med = sum(1 for i in all_issues if i.get("severity") == "medium")
    low = sum(1 for i in all_issues if i.get("severity") == "low")

    conn = _get_conn()
    conn.execute(
        """INSERT INTO file_scans (id, created_at, filenames, total_issues, high_count, medium_count, low_count, results_json, scan_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, now, json.dumps(filenames), len(all_issues), high, med, low, json.dumps(results), scan_type)
    )
    conn.commit()
    conn.close()
    return scan_id


def get_file_scan_history(limit: int = 20) -> list[dict]:
    """Get recent file scan history."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, created_at, filenames, total_issues, high_count, medium_count, low_count, scan_type FROM file_scans ORDER BY created_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "filenames": json.loads(r["filenames"]),
            "total_issues": r["total_issues"],
            "high_count": r["high_count"],
            "medium_count": r["medium_count"],
            "low_count": r["low_count"],
            "scan_type": r["scan_type"],
        }
        for r in rows
    ]


def get_file_scan_detail(scan_id: str) -> dict | None:
    """Get full details of a file scan."""
    conn = _get_conn()
    r = conn.execute("SELECT * FROM file_scans WHERE id = ?", (scan_id,)).fetchone()
    conn.close()
    if not r:
        return None
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "filenames": json.loads(r["filenames"]),
        "total_issues": r["total_issues"],
        "high_count": r["high_count"],
        "medium_count": r["medium_count"],
        "low_count": r["low_count"],
        "results": json.loads(r["results_json"]),
        "scan_type": r["scan_type"],
    }


# ─── Repo Audits ───

def create_repo_audit(repo_url: str, repo_name: str, total_files: int) -> str:
    """Create a new repo audit record. Returns audit ID."""
    audit_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    conn = _get_conn()
    conn.execute(
        """INSERT INTO repo_audits (id, repo_url, repo_name, status, created_at, total_files)
           VALUES (?, ?, ?, 'scanning', ?, ?)""",
        (audit_id, repo_url, repo_name, now, total_files)
    )
    conn.commit()
    conn.close()
    return audit_id


def update_repo_audit_progress(audit_id: str, scanned: int, issues: list[dict]):
    """Update scanning progress."""
    high = sum(1 for i in issues if i.get("severity") == "high")
    med = sum(1 for i in issues if i.get("severity") == "medium")
    low = sum(1 for i in issues if i.get("severity") == "low")

    conn = _get_conn()
    conn.execute(
        """UPDATE repo_audits SET scanned_files = ?, total_issues = ?, high_count = ?, medium_count = ?, low_count = ?, results_json = ?
           WHERE id = ?""",
        (scanned, len(issues), high, med, low, json.dumps(issues), audit_id)
    )
    conn.commit()
    conn.close()


def complete_repo_audit(audit_id: str, issues: list[dict], error: str = None):
    """Mark audit as complete."""
    now = datetime.now(timezone.utc).isoformat()
    status = "error" if error else "complete"

    high = sum(1 for i in issues if i.get("severity") == "high")
    med = sum(1 for i in issues if i.get("severity") == "medium")
    low = sum(1 for i in issues if i.get("severity") == "low")

    conn = _get_conn()
    conn.execute(
        """UPDATE repo_audits SET status = ?, completed_at = ?, total_issues = ?, high_count = ?, medium_count = ?, low_count = ?, results_json = ?, error = ?
           WHERE id = ?""",
        (status, now, len(issues), high, med, low, json.dumps(issues), error, audit_id)
    )
    conn.commit()
    conn.close()


def get_repo_audit(audit_id: str) -> dict | None:
    """Get a repo audit by ID."""
    conn = _get_conn()
    r = conn.execute("SELECT * FROM repo_audits WHERE id = ?", (audit_id,)).fetchone()
    conn.close()
    if not r:
        return None
    return {
        "id": r["id"],
        "repo_url": r["repo_url"],
        "repo_name": r["repo_name"],
        "status": r["status"],
        "created_at": r["created_at"],
        "completed_at": r["completed_at"],
        "total_files": r["total_files"],
        "scanned_files": r["scanned_files"],
        "total_issues": r["total_issues"],
        "high_count": r["high_count"],
        "medium_count": r["medium_count"],
        "low_count": r["low_count"],
        "results": json.loads(r["results_json"]),
        "error": r["error"],
    }


def get_repo_audit_history(limit: int = 20) -> list[dict]:
    """Get recent repo audit history (without full results)."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT id, repo_url, repo_name, status, created_at, completed_at,
                  total_files, scanned_files, total_issues, high_count, medium_count, low_count, error
           FROM repo_audits ORDER BY created_at DESC LIMIT ?""",
        (limit,)
    ).fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "repo_url": r["repo_url"],
            "repo_name": r["repo_name"],
            "status": r["status"],
            "created_at": r["created_at"],
            "completed_at": r["completed_at"],
            "total_files": r["total_files"],
            "scanned_files": r["scanned_files"],
            "total_issues": r["total_issues"],
            "high_count": r["high_count"],
            "medium_count": r["medium_count"],
            "low_count": r["low_count"],
            "error": r["error"],
        }
        for r in rows
    ]


# ─── Scheduled Audits ───

def create_schedule(repo_url: str, interval: str, model: str = None) -> str:
    """Create a scheduled audit. Returns schedule ID."""
    schedule_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()

    # Calculate next run
    from datetime import timedelta
    delta = timedelta(days=1) if interval == "daily" else timedelta(weeks=1)
    next_run = (datetime.now(timezone.utc) + delta).isoformat()

    conn = _get_conn()
    conn.execute(
        """INSERT INTO scheduled_audits (id, repo_url, interval, model, is_active, created_at, next_run)
           VALUES (?, ?, ?, ?, 1, ?, ?)""",
        (schedule_id, repo_url, interval, model, now, next_run)
    )
    conn.commit()
    conn.close()
    return schedule_id


def get_schedules(active_only: bool = True) -> list[dict]:
    """Get scheduled audits."""
    conn = _get_conn()
    if active_only:
        rows = conn.execute("SELECT * FROM scheduled_audits WHERE is_active = 1 ORDER BY created_at DESC").fetchall()
    else:
        rows = conn.execute("SELECT * FROM scheduled_audits ORDER BY created_at DESC").fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "repo_url": r["repo_url"],
            "interval": r["interval"],
            "model": r["model"],
            "is_active": bool(r["is_active"]),
            "created_at": r["created_at"],
            "last_run": r["last_run"],
            "next_run": r["next_run"],
            "last_audit_id": r["last_audit_id"],
        }
        for r in rows
    ]


def deactivate_schedule(schedule_id: str) -> bool:
    """Deactivate a scheduled audit."""
    conn = _get_conn()
    cursor = conn.execute("UPDATE scheduled_audits SET is_active = 0 WHERE id = ?", (schedule_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def update_schedule_last_run(schedule_id: str, audit_id: str, interval: str):
    """Update a schedule after a run."""
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    delta = timedelta(days=1) if interval == "daily" else timedelta(weeks=1)
    next_run = (now + delta).isoformat()

    conn = _get_conn()
    conn.execute(
        "UPDATE scheduled_audits SET last_run = ?, next_run = ?, last_audit_id = ? WHERE id = ?",
        (now.isoformat(), next_run, audit_id, schedule_id)
    )
    conn.commit()
    conn.close()


# ─── Recovery Sessions ───

def save_recovery_session(monitor: dict):
    """Insert or update a recovery monitor session."""
    conn = _get_conn()
    stats = monitor.get('stats', {})
    conn.execute(
        """INSERT OR REPLACE INTO recovery_sessions
           (monitor_id, repo_url, repo_name, repo_path, status, started_at, stopped_at,
            poll_interval, model, auto_fix, scans_completed, issues_found, issues_fixed,
            prs_created, events_json, issues_json, baseline_hashes_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            monitor['monitor_id'],
            monitor['repo_url'],
            monitor['repo_name'],
            monitor['repo_path'],
            monitor['status'],
            monitor['started_at'],
            monitor.get('stopped_at'),
            monitor['poll_interval'],
            monitor['model'],
            1 if monitor.get('auto_fix') else 0,
            stats.get('scans_completed', 0),
            stats.get('issues_found', 0),
            stats.get('issues_fixed', 0),
            stats.get('prs_created', 0),
            json.dumps(monitor.get('events', [])[-200:]),
            json.dumps(monitor.get('issues', [])),
            json.dumps(monitor.get('baseline_hashes', {})),
        )
    )
    conn.commit()
    conn.close()


def load_recovery_sessions() -> list[dict]:
    """Load all recovery sessions from the database."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM recovery_sessions ORDER BY started_at DESC"
    ).fetchall()
    conn.close()

    sessions = []
    for r in rows:
        sessions.append({
            'monitor_id': r['monitor_id'],
            'repo_url': r['repo_url'],
            'repo_name': r['repo_name'],
            'repo_path': r['repo_path'],
            'status': r['status'],
            'started_at': r['started_at'],
            'stopped_at': r['stopped_at'],
            'poll_interval': r['poll_interval'],
            'model': r['model'],
            'auto_fix': bool(r['auto_fix']),
            'stats': {
                'scans_completed': r['scans_completed'],
                'issues_found': r['issues_found'],
                'issues_fixed': r['issues_fixed'],
                'prs_created': r['prs_created'],
            },
            'events': json.loads(r['events_json'] or '[]'),
            'issues': json.loads(r['issues_json'] or '[]'),
            'baseline_hashes': json.loads(r['baseline_hashes_json'] or '{}'),
        })
    return sessions


def delete_recovery_session(monitor_id: str):
    """Remove a recovery session from the database."""
    conn = _get_conn()
    conn.execute("DELETE FROM recovery_sessions WHERE monitor_id = ?", (monitor_id,))
    conn.commit()
    conn.close()


# Initialize DB on import
init_db()
