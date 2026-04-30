"""
Recovery Loop Agent
===================
Continuous monitoring and auto-remediation system for customer codebases.

Flow:
  1. Customer provides GitHub repo URL (+ token for private repos)
  2. Agent clones the repo and performs initial scan
  3. Periodic polling detects new commits / file changes
  4. For each change: security scan + legacy code detection
  5. Auto-generates fixes and creates pull requests
  6. Full event log available via API
"""

import os
import time
import threading
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
import git

from clone_convert import clone_repo, scan_files, bulk_convert, cleanup_clone, _safe_rmtree
from security_check import ai_security_check
from translate import migrate_code_str, fetch_api_key
from database import save_recovery_session, load_recovery_sessions, delete_recovery_session


# ─── In-memory store for monitored repos and their events ───

_monitored_repos: dict[str, dict] = {}
_repo_locks: dict[str, threading.Lock] = {}
_stop_events: dict[str, threading.Event] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bootstrap_from_db():
    """
    Load previously saved sessions from SQLite on startup.
    Active sessions are marked stopped (polling threads cannot be recovered).
    Stopped sessions load as-is so history is visible immediately.
    """
    try:
        sessions = load_recovery_sessions()
    except Exception:
        return

    for session in sessions:
        mid = session['monitor_id']
        if session['status'] == 'active':
            session['status'] = 'stopped'
            session.setdefault('stopped_at', _now_iso())
            session['events'].append({
                'id': str(uuid.uuid4())[:8],
                'timestamp': _now_iso(),
                'level': 'info',
                'message': 'Monitoring paused – backend was restarted. Re-start monitoring to resume.',
            })
            save_recovery_session(session)
        _monitored_repos[mid] = session
        _repo_locks[mid] = threading.Lock()
        _stop_events[mid] = threading.Event()
        _stop_events[mid].set()


# Load persisted sessions on module import
_bootstrap_from_db()


def _file_hash(filepath: str) -> str:
    """SHA-256 hash of a file's contents for change detection."""
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
    except OSError:
        return ""
    return h.hexdigest()


def _build_file_hashes(repo_path: str, extensions: list[str] | None = None) -> dict[str, str]:
    """Walk the repo and hash every tracked file → {rel_path: sha256}."""
    if extensions is None:
        extensions = [".py", ".java"]

    skip_dirs = {".git", "__pycache__", "node_modules", ".venv", "venv", "env",
                 ".eggs", ".tox", "build", "dist", ".idea", ".vscode"}
    hashes: dict[str, str] = {}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in extensions:
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, repo_path).replace("\\", "/")
                hashes[rel_path] = _file_hash(abs_path)

    return hashes


def _detect_legacy_patterns(code: str) -> list[dict]:
    """Quick heuristic scan for Python 2 legacy patterns (no AI needed)."""
    issues: list[dict] = []
    lines = code.split("\n")

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # print statement without parentheses
        if stripped.startswith("print ") and not stripped.startswith("print("):
            issues.append({
                "line": i,
                "type": "legacy_print",
                "detail": "Python 2 print statement detected",
                "code": stripped,
            })

        # raw_input (Python 2)
        if "raw_input(" in stripped:
            issues.append({
                "line": i,
                "type": "legacy_raw_input",
                "detail": "Python 2 raw_input() should be input()",
                "code": stripped,
            })

        # old-style string formatting with %
        if "% (" in stripped or "%s" in stripped or "%d" in stripped:
            if "%" in stripped and "f\"" not in stripped and "format(" not in stripped:
                issues.append({
                    "line": i,
                    "type": "legacy_string_format",
                    "detail": "Old-style % string formatting; prefer f-strings",
                    "code": stripped,
                })

        # xrange (Python 2)
        if "xrange(" in stripped:
            issues.append({
                "line": i,
                "type": "legacy_xrange",
                "detail": "Python 2 xrange() should be range()",
                "code": stripped,
            })

        # except without 'as' keyword  (bare except or old comma syntax)
        if stripped.startswith("except") and "," in stripped and " as " not in stripped:
            issues.append({
                "line": i,
                "type": "legacy_except_syntax",
                "detail": "Old-style except clause; use 'except Exception as e'",
                "code": stripped,
            })

    return issues


# ─── Core monitoring functions ───

def start_monitoring(
    repo_url: str,
    poll_interval_seconds: int = 300,
    model_name: str | None = None,
    auto_fix: bool = True,
) -> dict:
    """
    Begin monitoring a GitHub repository.

    Returns a monitor descriptor (id, status, etc.).
    """
    monitor_id = str(uuid.uuid4())[:8]

    # Prevent duplicate monitoring of the same repo
    for mid, info in _monitored_repos.items():
        if info["repo_url"] == repo_url and info["status"] == "active":
            return {
                "success": False,
                "error": f"Repo already monitored under id={mid}",
                "monitor_id": mid,
            }

    token = None
    try:
        token = fetch_api_key("GitHub")
    except Exception:
        pass

    # Clone once for the initial baseline
    clone_result = clone_repo(repo_url, token)
    if not clone_result.get("success"):
        return {"success": False, "error": clone_result.get("error", "Clone failed")}

    repo_path = clone_result["repo_path"]
    repo_name = clone_result["repo_name"]

    # Build baseline hashes
    baseline_hashes = _build_file_hashes(repo_path)

    monitor = {
        "monitor_id": monitor_id,
        "repo_url": repo_url,
        "repo_name": repo_name,
        "repo_path": repo_path,
        "status": "active",
        "started_at": _now_iso(),
        "poll_interval": poll_interval_seconds,
        "model": model_name or "llama-3.3-70b-versatile",
        "auto_fix": auto_fix,
        "baseline_hashes": baseline_hashes,
        "events": [],
        "issues": [],
        "stats": {
            "scans_completed": 0,
            "issues_found": 0,
            "issues_fixed": 0,
            "prs_created": 0,
        },
    }

    _monitored_repos[monitor_id] = monitor
    _repo_locks[monitor_id] = threading.Lock()
    _stop_events[monitor_id] = threading.Event()

    # Persist immediately so it survives a backend restart
    save_recovery_session(monitor)

    # Run initial scan immediately
    _add_event(monitor_id, "info", "Monitoring started – running initial scan")
    _run_single_scan(monitor_id)

    # Spin up background polling thread
    t = threading.Thread(target=_poll_loop, args=(monitor_id,), daemon=True)
    t.start()

    return {
        "success": True,
        "monitor_id": monitor_id,
        "repo_name": repo_name,
        "message": f"Monitoring started for {repo_name}",
        "baseline_files": len(baseline_hashes),
    }


def stop_monitoring(monitor_id: str) -> dict:
    """Stop monitoring a repository."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return {"success": False, "error": "Monitor not found"}

    _stop_events[monitor_id].set()
    monitor["status"] = "stopped"
    monitor["stopped_at"] = _now_iso()
    _add_event(monitor_id, "info", "Monitoring stopped by user")
    save_recovery_session(monitor)

    return {"success": True, "monitor_id": monitor_id, "message": "Monitoring stopped"}


def get_monitor_status(monitor_id: str | None = None) -> dict:
    """Get status of one or all monitors."""
    if monitor_id:
        monitor = _monitored_repos.get(monitor_id)
        if not monitor:
            return {"success": False, "error": "Monitor not found"}
        return {"success": True, "monitor": _safe_monitor_info(monitor)}

    # Return all monitors
    monitors = [_safe_monitor_info(m) for m in _monitored_repos.values()]
    return {"success": True, "monitors": monitors}


def get_monitor_events(monitor_id: str, limit: int = 50) -> dict:
    """Get the event log for a monitor."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return {"success": False, "error": "Monitor not found"}

    events = monitor["events"][-limit:]
    return {"success": True, "monitor_id": monitor_id, "events": events, "total": len(monitor["events"])}


def get_monitor_issues(monitor_id: str) -> dict:
    """Get the detailed issues from the latest scan."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return {"success": False, "error": "Monitor not found"}

    issues = monitor.get("issues", [])

    # Group by file for easier consumption
    by_file: dict[str, list] = {}
    for issue in issues:
        fname = issue["file"]
        if fname not in by_file:
            by_file[fname] = []
        by_file[fname].append(issue)

    return {
        "success": True,
        "monitor_id": monitor_id,
        "total": len(issues),
        "issues": issues,
        "by_file": by_file,
    }


def trigger_scan(monitor_id: str) -> dict:
    """Manually trigger an immediate scan."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return {"success": False, "error": "Monitor not found"}

    _add_event(monitor_id, "info", "Manual scan triggered")
    result = _run_single_scan(monitor_id)
    return {"success": True, "monitor_id": monitor_id, "scan_result": result}


# ─── Internal helpers ───

def _safe_monitor_info(monitor: dict) -> dict:
    """Return a JSON-safe subset of monitor data (no huge hashes)."""
    return {
        "monitor_id": monitor["monitor_id"],
        "repo_url": monitor["repo_url"],
        "repo_name": monitor["repo_name"],
        "status": monitor["status"],
        "started_at": monitor["started_at"],
        "stopped_at": monitor.get("stopped_at"),
        "poll_interval": monitor["poll_interval"],
        "model": monitor["model"],
        "auto_fix": monitor["auto_fix"],
        "stats": monitor["stats"],
        "recent_events": monitor["events"][-10:],
        "total_events": len(monitor["events"]),
        "tracked_files": len(monitor.get("baseline_hashes", {})),
        "issues_count": len(monitor.get("issues", [])),
    }


def _add_event(monitor_id: str, level: str, message: str, data: dict | None = None):
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return
    event = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": _now_iso(),
        "level": level,   # info | warning | error | fix
        "message": message,
    }
    if data:
        event["data"] = data
    monitor["events"].append(event)
    # Persist after every event so nothing is lost on restart
    try:
        save_recovery_session(monitor)
    except Exception:
        pass


def _poll_loop(monitor_id: str):
    """Background thread: periodically pull and scan."""
    stop_event = _stop_events[monitor_id]
    monitor = _monitored_repos[monitor_id]
    interval = monitor["poll_interval"]

    while not stop_event.is_set():
        stop_event.wait(interval)
        if stop_event.is_set():
            break
        _pull_and_scan(monitor_id)


def _pull_and_scan(monitor_id: str):
    """Pull latest changes from remote and run a scan."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor or monitor["status"] != "active":
        return

    repo_path = monitor["repo_path"]
    lock = _repo_locks[monitor_id]

    with lock:
        try:
            repo = git.Repo(repo_path)
            origin = repo.remotes.origin
            origin.pull()
            _add_event(monitor_id, "info", "Pulled latest changes from remote")
        except Exception as e:
            _add_event(monitor_id, "warning", f"Git pull failed: {str(e)}")
            return

        _run_single_scan(monitor_id)


def _run_single_scan(monitor_id: str) -> dict:
    """
    Scan the repo for:
      1. File changes since last baseline
      2. Legacy Python 2 patterns
      3. Security vulnerabilities (via AI)

    If auto_fix is enabled, generate fixes and push a PR.
    """
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return {"error": "Monitor not found"}

    repo_path = monitor["repo_path"]
    model = monitor["model"]
    auto_fix = monitor["auto_fix"]

    # 1. Detect changed files
    current_hashes = _build_file_hashes(repo_path)
    old_hashes = monitor.get("baseline_hashes", {})

    changed_files: list[str] = []
    new_files: list[str] = []

    for path, h in current_hashes.items():
        if path not in old_hashes:
            new_files.append(path)
        elif old_hashes[path] != h:
            changed_files.append(path)

    files_to_scan = changed_files + new_files
    if not files_to_scan:
        # If first scan, scan everything
        if monitor["stats"]["scans_completed"] == 0:
            files_to_scan = list(current_hashes.keys())
        else:
            _add_event(monitor_id, "info", "No file changes detected")
            monitor["stats"]["scans_completed"] += 1
            monitor["baseline_hashes"] = current_hashes
            return {"changed": 0, "issues": 0}

    _add_event(monitor_id, "info", f"Scanning {len(files_to_scan)} file(s)…",
               {"new": len(new_files), "changed": len(changed_files)})

    # 2. Scan each file
    all_issues: list[dict] = []
    files_with_issues: list[dict] = []

    for rel_path in files_to_scan:
        abs_path = os.path.join(repo_path, rel_path)
        if not os.path.exists(abs_path):
            continue

        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                code = f.read()
        except OSError:
            continue

        if not code.strip():
            continue

        ext = os.path.splitext(rel_path)[1].lower()
        language = "python" if ext == ".py" else "java"

        file_issues: list[dict] = []

        # 2a. Legacy pattern detection (Python only, fast)
        if language == "python":
            legacy = _detect_legacy_patterns(code)
            for lp in legacy:
                file_issues.append({
                    "category": "legacy",
                    "severity": "medium",
                    "file": rel_path,
                    "line": lp["line"],
                    "title": lp["type"],
                    "description": lp["detail"],
                    "code": lp["code"],
                })

        # 2b. AI security scan
        try:
            security_issues = ai_security_check(code, os.path.basename(rel_path), model, language)
            for si in security_issues:
                file_issues.append({
                    "category": "security",
                    "severity": si.get("risk_level", "medium"),
                    "file": rel_path,
                    "line": si.get("line", 1),
                    "title": si.get("issue_title", "Security Issue"),
                    "description": si.get("description", ""),
                    "code": si.get("flagged_code", ""),
                    "recommended_code": si.get("recommended_code", ""),
                    "suggested_fix": si.get("suggested_fix", ""),
                    "compliance": si.get("compliance_category", "General"),
                })
        except Exception as e:
            _add_event(monitor_id, "warning", f"AI scan failed for {rel_path}: {str(e)}")

        if file_issues:
            files_with_issues.append({"file": rel_path, "issues": file_issues, "code": code})
            all_issues.extend(file_issues)

    total_issues = len(all_issues)
    monitor["stats"]["scans_completed"] += 1
    monitor["stats"]["issues_found"] += total_issues

    # Store full issue details (replace previous scan's issues)
    monitor["issues"] = all_issues

    if total_issues == 0:
        _add_event(monitor_id, "info", "Scan complete – no issues found ✓")
    else:
        high = sum(1 for i in all_issues if i["severity"] == "high")
        med = sum(1 for i in all_issues if i["severity"] == "medium")
        low = sum(1 for i in all_issues if i["severity"] == "low")

        # Build per-file breakdown for the event
        file_breakdown = {}
        for issue in all_issues:
            fname = issue["file"]
            if fname not in file_breakdown:
                file_breakdown[fname] = []
            file_breakdown[fname].append({
                "title": issue["title"],
                "severity": issue["severity"],
                "line": issue.get("line"),
                "description": issue.get("description", ""),
                "category": issue.get("category", ""),
            })

        _add_event(
            monitor_id, "warning",
            f"Scan complete – {total_issues} issue(s) found: {high} high, {med} medium, {low} low",
            {
                "issues_summary": {"high": high, "medium": med, "low": low},
                "file_breakdown": file_breakdown,
            },
        )

    # 3. Auto-fix if enabled and there are issues
    if auto_fix and files_with_issues:
        _auto_remediate(monitor_id, files_with_issues)

    # Update baseline
    monitor["baseline_hashes"] = current_hashes

    return {
        "changed": len(changed_files),
        "new": len(new_files),
        "scanned": len(files_to_scan),
        "issues": total_issues,
    }


def _auto_remediate(monitor_id: str, files_with_issues: list[dict]):
    """
    For each file with issues, use the AI to generate fixed code,
    then create a PR on GitHub with the remediation.
    """
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return

    repo_name = monitor["repo_name"]
    model = monitor["model"]
    repo_path = monitor["repo_path"]

    converted_files: list[dict] = []

    for entry in files_with_issues:
        rel_path = entry["file"]
        code = entry["code"]
        ext = os.path.splitext(rel_path)[1].lower()

        try:
            if ext == ".py":
                fixed_code, explanation, _ = migrate_code_str(code, os.path.basename(rel_path), model)
            else:
                # For Java, just apply the recommended_code from security issues
                fixed_code = code
                for issue in entry["issues"]:
                    rec = issue.get("recommended_code", "")
                    flagged = issue.get("code", "")
                    if rec and flagged and flagged in fixed_code:
                        fixed_code = fixed_code.replace(flagged, rec, 1)
                explanation = "Applied security fixes"

            if fixed_code and fixed_code.strip() != code.strip():
                converted_files.append({
                    "path": rel_path,
                    "content": fixed_code,
                    "explanation": explanation,
                })
                _add_event(monitor_id, "fix", f"Generated fix for {rel_path}")
                monitor["stats"]["issues_fixed"] += len(entry["issues"])

        except Exception as e:
            _add_event(monitor_id, "error", f"Auto-fix failed for {rel_path}: {str(e)}")

    # Push changes as a PR
    if converted_files:
        _create_remediation_pr(monitor_id, converted_files)


def _create_remediation_pr(monitor_id: str, converted_files: list[dict]):
    """Create a GitHub PR with the auto-remediated files."""
    monitor = _monitored_repos.get(monitor_id)
    if not monitor:
        return

    repo_name = monitor["repo_name"]

    try:
        token = fetch_api_key("GitHub")
    except Exception as e:
        _add_event(monitor_id, "error", f"Cannot create PR – no GitHub token: {str(e)}")
        return

    if not token:
        _add_event(monitor_id, "error", "Cannot create PR – GitHub token not configured")
        return

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
    }

    # Get default branch
    default_branch = "main"
    try:
        repo_resp = requests.get(f"https://api.github.com/repos/{repo_name}", headers=headers, timeout=10)
        if repo_resp.status_code == 200:
            default_branch = repo_resp.json().get("default_branch", "main")
    except Exception:
        pass

    # Get the SHA of the default branch HEAD
    try:
        ref_resp = requests.get(
            f"https://api.github.com/repos/{repo_name}/git/ref/heads/{default_branch}",
            headers=headers, timeout=10,
        )
        if ref_resp.status_code != 200:
            _add_event(monitor_id, "error", "Cannot get branch ref for PR creation")
            return
        base_sha = ref_resp.json()["object"]["sha"]
    except Exception as e:
        _add_event(monitor_id, "error", f"Failed to get base SHA: {str(e)}")
        return

    # Create a new branch
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    branch_name = f"coderenew/recovery-{monitor_id}-{timestamp}"

    try:
        create_ref = requests.post(
            f"https://api.github.com/repos/{repo_name}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            timeout=10,
        )
        if create_ref.status_code not in (200, 201):
            _add_event(monitor_id, "error", f"Failed to create branch: {create_ref.text}")
            return
    except Exception as e:
        _add_event(monitor_id, "error", f"Branch creation failed: {str(e)}")
        return

    # Commit each file
    import base64
    commit_success = 0
    for cf in converted_files:
        try:
            # Check if file already exists (to get SHA for update)
            get_resp = requests.get(
                f"https://api.github.com/repos/{repo_name}/contents/{cf['path']}",
                headers=headers,
                params={"ref": branch_name},
                timeout=10,
            )
            sha = None
            if get_resp.status_code == 200 and isinstance(get_resp.json(), dict):
                sha = get_resp.json().get("sha")

            payload = {
                "message": f"fix: auto-remediate {cf['path']}\n\n{cf.get('explanation', '')}",
                "content": base64.b64encode(cf["content"].encode("utf-8")).decode("utf-8"),
                "branch": branch_name,
            }
            if sha:
                payload["sha"] = sha

            put_resp = requests.put(
                f"https://api.github.com/repos/{repo_name}/contents/{cf['path']}",
                headers=headers,
                json=payload,
                timeout=15,
            )
            if put_resp.status_code in (200, 201):
                commit_success += 1
        except Exception as e:
            _add_event(monitor_id, "error", f"Commit failed for {cf['path']}: {str(e)}")

    if commit_success == 0:
        _add_event(monitor_id, "error", "No files committed – PR not created")
        return

    # Create pull request
    pr_body = "## 🔄 Code Renew – Recovery Loop Auto-Remediation\n\n"
    pr_body += f"**Monitor ID:** `{monitor_id}`\n"
    pr_body += f"**Files fixed:** {commit_success}\n\n"
    pr_body += "### Changes\n"
    for cf in converted_files:
        pr_body += f"- `{cf['path']}` – {cf.get('explanation', 'fixes applied')[:100]}\n"
    pr_body += "\n---\n*Auto-generated by Code Renew Recovery Loop Agent*"

    try:
        pr_resp = requests.post(
            f"https://api.github.com/repos/{repo_name}/pulls",
            headers=headers,
            json={
                "title": f"🔄 Code Renew Recovery: Auto-fix ({timestamp})",
                "body": pr_body,
                "head": branch_name,
                "base": default_branch,
            },
            timeout=15,
        )
        if pr_resp.status_code in (200, 201):
            pr_url = pr_resp.json().get("html_url", "")
            monitor["stats"]["prs_created"] += 1
            _add_event(monitor_id, "fix", f"✅ Pull request created: {pr_url}",
                       {"pr_url": pr_url, "files_fixed": commit_success})
        else:
            _add_event(monitor_id, "error", f"PR creation failed: {pr_resp.text[:200]}")
    except Exception as e:
        _add_event(monitor_id, "error", f"PR creation failed: {str(e)}")
