"""
Repo Audit Module
==================
Clone a GitHub repo, scan all files for security vulnerabilities,
and optionally schedule recurring audits.
"""

import os
import threading
import time
from datetime import datetime, timezone

from clone_convert import clone_repo, cleanup_clone
from security_check import ai_security_check
from database import (
    create_repo_audit, update_repo_audit_progress, complete_repo_audit,
    get_repo_audit, create_schedule, get_schedules, update_schedule_last_run,
    deactivate_schedule,
)

# In-memory cache for active audit progress (for fast polling)
_active_audits: dict[str, dict] = {}
_scheduler_thread: threading.Thread | None = None
_scheduler_stop = threading.Event()

SUPPORTED_EXTS = {'.py', '.java', '.cpp', '.cc', '.cxx', '.h', '.hpp',
                  '.js', '.jsx', '.ts', '.tsx', '.cs', '.rb'}

LANG_MAP = {
    '.py': 'python', '.java': 'java', '.cpp': 'python', '.cc': 'python',
    '.cxx': 'python', '.h': 'python', '.hpp': 'python',
    '.js': 'python', '.jsx': 'python', '.ts': 'python', '.tsx': 'python',
    '.cs': 'python', '.rb': 'python',
}


def _collect_files(repo_path: str) -> list[dict]:
    """Walk repo and collect scannable source files."""
    skip_dirs = {'.git', '__pycache__', 'node_modules', '.venv', 'venv',
                 'env', '.eggs', '.tox', 'build', 'dist', 'target',
                 '.idea', '.vscode'}
    files = []

    for root, dirs, filenames in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith('.')]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SUPPORTED_EXTS:
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, repo_path).replace("\\", "/")
                files.append({
                    "abs_path": abs_path,
                    "rel_path": rel_path,
                    "ext": ext,
                    "language": LANG_MAP.get(ext, "python"),
                })
    return files


def start_repo_audit(repo_url: str, model: str = None) -> dict:
    """
    Clone a repo and start scanning it for security issues in a background thread.
    Returns immediately with an audit_id for polling.
    """
    from translate import fetch_api_key

    # Get GitHub token for private repos
    token = None
    try:
        token = fetch_api_key("GitHub")
    except Exception:
        pass

    # Clone the repo
    clone_result = clone_repo(repo_url, token)
    if not clone_result.get("success"):
        return {"success": False, "error": clone_result.get("error", "Clone failed")}

    repo_path = clone_result["repo_path"]
    repo_name = clone_result.get("repo_name", repo_url.split("/")[-1])

    # Collect scannable files
    files = _collect_files(repo_path)
    if not files:
        cleanup_clone(repo_path)
        return {"success": False, "error": "No scannable source files found in repository"}

    # Create audit record in DB
    audit_id = create_repo_audit(repo_url, repo_name, len(files))

    # Set up in-memory progress tracker
    _active_audits[audit_id] = {
        "status": "scanning",
        "total_files": len(files),
        "scanned_files": 0,
        "current_file": "",
        "issues": [],
    }

    # Start background scan
    t = threading.Thread(
        target=_run_audit_scan,
        args=(audit_id, repo_path, repo_name, files, model),
        daemon=True,
    )
    t.start()

    return {
        "success": True,
        "audit_id": audit_id,
        "repo_name": repo_name,
        "total_files": len(files),
        "status": "scanning",
    }


def _run_audit_scan(audit_id: str, repo_path: str, repo_name: str,
                    files: list[dict], model: str = None):
    """Background thread: scan each file for security issues."""
    all_issues = []
    scanned = 0

    for file_info in files:
        abs_path = file_info["abs_path"]
        rel_path = file_info["rel_path"]
        language = file_info["language"]

        # Update current file in progress tracker
        if audit_id in _active_audits:
            _active_audits[audit_id]["current_file"] = rel_path

        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                code = f.read()

            if not code.strip():
                scanned += 1
                continue

            # Run AI security check
            issues = ai_security_check(code, rel_path, model, language)

            # Add file path to each issue
            for issue in issues:
                issue["file"] = rel_path
                all_issues.append(issue)

            scanned += 1

            # Update progress in memory and DB
            if audit_id in _active_audits:
                _active_audits[audit_id]["scanned_files"] = scanned
                _active_audits[audit_id]["issues"] = all_issues

            # Update DB every 3 files to avoid too many writes
            if scanned % 3 == 0 or scanned == len(files):
                update_repo_audit_progress(audit_id, scanned, all_issues)

            # Rate limit: small delay between AI calls
            time.sleep(1)

        except Exception as e:
            print(f"[Audit {audit_id}] Error scanning {rel_path}: {e}")
            scanned += 1
            if audit_id in _active_audits:
                _active_audits[audit_id]["scanned_files"] = scanned

    # Complete the audit
    complete_repo_audit(audit_id, all_issues)

    if audit_id in _active_audits:
        _active_audits[audit_id]["status"] = "complete"
        _active_audits[audit_id]["scanned_files"] = len(files)
        _active_audits[audit_id]["issues"] = all_issues

    # Cleanup cloned repo
    try:
        cleanup_clone(repo_path)
    except Exception:
        pass

    print(f"[Audit {audit_id}] Complete: {len(all_issues)} issues in {scanned} files")


def get_audit_status(audit_id: str) -> dict:
    """Get current status of an audit (fast, from memory if active)."""
    # Check in-memory first for active audits
    if audit_id in _active_audits:
        mem = _active_audits[audit_id]
        return {
            "success": True,
            "audit_id": audit_id,
            "status": mem["status"],
            "total_files": mem["total_files"],
            "scanned_files": mem["scanned_files"],
            "current_file": mem.get("current_file", ""),
            "total_issues": len(mem["issues"]),
            "issues": mem["issues"],
        }

    # Fall back to DB for completed audits
    audit = get_repo_audit(audit_id)
    if not audit:
        return {"success": False, "error": "Audit not found"}

    return {
        "success": True,
        "audit_id": audit_id,
        "status": audit["status"],
        "total_files": audit["total_files"],
        "scanned_files": audit["scanned_files"],
        "current_file": "",
        "total_issues": audit["total_issues"],
        "high_count": audit["high_count"],
        "medium_count": audit["medium_count"],
        "low_count": audit["low_count"],
        "issues": audit["results"],
        "created_at": audit["created_at"],
        "completed_at": audit["completed_at"],
        "repo_name": audit["repo_name"],
        "repo_url": audit["repo_url"],
        "error": audit["error"],
    }


def schedule_repo_audit(repo_url: str, interval: str, model: str = None) -> dict:
    """Schedule a recurring audit."""
    if interval not in ("daily", "weekly"):
        return {"success": False, "error": "Interval must be 'daily' or 'weekly'"}

    schedule_id = create_schedule(repo_url, interval, model)

    # Ensure scheduler thread is running
    _ensure_scheduler_running()

    return {
        "success": True,
        "schedule_id": schedule_id,
        "repo_url": repo_url,
        "interval": interval,
        "message": f"Audit scheduled {interval} for {repo_url}",
    }


def cancel_schedule(schedule_id: str) -> dict:
    """Cancel a scheduled audit."""
    success = deactivate_schedule(schedule_id)
    if success:
        return {"success": True, "message": "Schedule cancelled"}
    return {"success": False, "error": "Schedule not found"}


def _ensure_scheduler_running():
    """Start the scheduler background thread if not running."""
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return

    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True)
    _scheduler_thread.start()


def _scheduler_loop():
    """Check for due scheduled audits every 60 seconds."""
    while not _scheduler_stop.is_set():
        try:
            schedules = get_schedules(active_only=True)
            now = datetime.now(timezone.utc)

            for sched in schedules:
                next_run_str = sched.get("next_run")
                if not next_run_str:
                    continue

                next_run = datetime.fromisoformat(next_run_str)
                if now >= next_run:
                    # Time to run this audit
                    print(f"[Scheduler] Running scheduled audit for {sched['repo_url']}")
                    result = start_repo_audit(sched["repo_url"], sched.get("model"))
                    if result.get("success"):
                        update_schedule_last_run(
                            sched["id"], result["audit_id"], sched["interval"]
                        )

        except Exception as e:
            print(f"[Scheduler] Error: {e}")

        _scheduler_stop.wait(60)  # Check every 60 seconds
