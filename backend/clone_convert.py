import os
import shutil
import tempfile
import stat
import base64
from pathlib import Path
from typing import Optional

import git
import requests

from translate import migrate_code_str, convert_code_str


# Persistent temp directory for cloned repos
CLONE_BASE_DIR = os.path.join(tempfile.gettempdir(), "code_renew_clones")
os.makedirs(CLONE_BASE_DIR, exist_ok=True)


def _force_remove_readonly(func, path, excinfo):
    """Handle read-only files on Windows (e.g., .git internals)."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _safe_rmtree(path):
    """Safely remove a directory tree, handling Windows read-only files."""
    if os.path.exists(path):
        shutil.rmtree(path, onerror=_force_remove_readonly)


def clone_repo(repo_url: str, token: Optional[str] = None) -> dict:
    """
    Clone a GitHub repository to a local temp directory.
    
    Args:
        repo_url: GitHub repo in 'owner/repo' format or full URL
        token: GitHub personal access token for private repos
    
    Returns:
        dict with repo_path, file_count, and repo info
    """
    # Normalize repo_url
    if repo_url.startswith("https://github.com/"):
        repo_name = repo_url.replace("https://github.com/", "").strip("/")
    elif repo_url.startswith("http://github.com/"):
        repo_name = repo_url.replace("http://github.com/", "").strip("/")
    else:
        repo_name = repo_url.strip().strip("/")
    
    # Remove .git suffix if present (use removesuffix to avoid stripping chars)
    if repo_name.endswith(".git"):
        repo_name = repo_name[:-4]
    
    # Build the clone URL with token for auth
    if token:
        clone_url = f"https://{token}@github.com/{repo_name}.git"
    else:
        clone_url = f"https://github.com/{repo_name}.git"
    
    # Create a unique directory for this clone
    safe_name = repo_name.replace("/", "_")
    clone_path = os.path.join(CLONE_BASE_DIR, safe_name)
    
    # Remove existing clone if present (force remove read-only files on Windows)
    _safe_rmtree(clone_path)
    
    try:
        repo = git.Repo.clone_from(clone_url, clone_path, depth=1)
        default_branch = repo.active_branch.name
        
        return {
            "success": True,
            "repo_path": clone_path,
            "repo_name": repo_name,
            "default_branch": default_branch,
            "message": f"Successfully cloned {repo_name}"
        }
    except git.exc.GitCommandError as e:
        return {
            "success": False,
            "error": f"Git clone failed: {str(e)}",
            "repo_name": repo_name
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Clone failed: {str(e)}",
            "repo_name": repo_name
        }


def scan_files(repo_path: str, extensions: list = None) -> dict:
    """
    Recursively scan a cloned repo for code files.
    
    Args:
        repo_path: path to the cloned repo
        extensions: list of file extensions to look for (e.g., ['.py', '.java'])
    
    Returns:
        dict with files list and stats
    """
    if extensions is None:
        extensions = ['.py', '.java']
    
    files = []
    skip_dirs = {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'env',
                 '.eggs', '.tox', 'build', 'dist', '.idea', '.vscode'}
    
    repo_root = Path(repo_path)
    
    for root, dirs, filenames in os.walk(repo_path):
        # Skip hidden and build directories
        dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith('.')]
        
        for filename in filenames:
            filepath = os.path.join(root, filename)
            ext = os.path.splitext(filename)[1].lower()
            
            if ext in extensions:
                rel_path = os.path.relpath(filepath, repo_path).replace("\\", "/")
                try:
                    size = os.path.getsize(filepath)
                    files.append({
                        "name": filename,
                        "path": rel_path,
                        "extension": ext,
                        "size": size,
                        "language": "python" if ext == ".py" else "java"
                    })
                except OSError:
                    continue
    
    # Sort by path for a clean tree structure
    files.sort(key=lambda f: f["path"])
    
    py_count = sum(1 for f in files if f["extension"] == ".py")
    java_count = sum(1 for f in files if f["extension"] == ".java")
    
    return {
        "files": files,
        "total": len(files),
        "python_count": py_count,
        "java_count": java_count,
        "repo_path": repo_path
    }


def bulk_convert(repo_path: str, file_paths: list, mode: str, model_name: str = None) -> dict:
    """
    Convert multiple files from a cloned repo.
    
    Args:
        repo_path: path to the cloned repo
        file_paths: list of relative file paths to convert
        mode: conversion mode ('py2to3', 'java2py', 'py2java')
        model_name: AI model to use
    
    Returns:
        dict with results for each file
    """
    results = []
    success_count = 0
    error_count = 0
    
    for rel_path in file_paths:
        abs_path = os.path.join(repo_path, rel_path)
        
        if not os.path.exists(abs_path):
            results.append({
                "path": rel_path,
                "status": "error",
                "error": "File not found"
            })
            error_count += 1
            continue
        
        try:
            with open(abs_path, 'r', encoding='utf-8', errors='replace') as f:
                code = f.read()
            
            if not code.strip():
                results.append({
                    "path": rel_path,
                    "status": "skipped",
                    "reason": "Empty file"
                })
                continue
            
            filename = os.path.basename(rel_path)
            
            if mode == 'py2to3':
                converted, explanation, security = migrate_code_str(code, filename, model_name)
            elif mode in ('java2py', 'py2java'):
                converted, explanation, security = convert_code_str(code, mode, filename, model_name)
            else:
                results.append({
                    "path": rel_path,
                    "status": "error",
                    "error": f"Unknown mode: {mode}"
                })
                error_count += 1
                continue
            
            # Determine the converted file's new path
            if mode == 'java2py':
                new_path = rel_path.rsplit('.', 1)[0] + '.py'
            elif mode == 'py2java':
                new_path = rel_path.rsplit('.', 1)[0] + '.java'
            else:
                new_path = rel_path  # py2to3 keeps same extension
            
            results.append({
                "path": rel_path,
                "new_path": new_path,
                "status": "success",
                "converted_code": converted,
                "explanation": explanation,
                "security_issues": security if isinstance(security, list) else [],
                "original_size": len(code),
                "converted_size": len(converted)
            })
            success_count += 1
            
        except Exception as e:
            results.append({
                "path": rel_path,
                "status": "error",
                "error": str(e)
            })
            error_count += 1
    
    return {
        "results": results,
        "total": len(file_paths),
        "success_count": success_count,
        "error_count": error_count
    }


def push_branch(repo_name: str, branch_name: str, converted_files: list,
                commit_message: str, token: str) -> dict:
    """
    Create a new branch on GitHub, commit converted files, and create a PR.
    Uses the GitHub API (no local git needed after clone).
    
    Args:
        repo_name: 'owner/repo' format
        branch_name: name for the new branch
        converted_files: list of dicts with 'path' and 'content'
        commit_message: commit message
        token: GitHub token
    
    Returns:
        dict with branch info and PR URL
    """
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json"
    }
    base_url = f"https://api.github.com/repos/{repo_name}"
    
    try:
        # 1. Get the default branch's latest commit SHA
        repo_info = requests.get(base_url, headers=headers)
        if repo_info.status_code != 200:
            return {"success": False, "error": f"Cannot access repo: {repo_info.json().get('message', 'Unknown error')}"}
        
        default_branch = repo_info.json().get("default_branch", "main")
        
        ref_res = requests.get(f"{base_url}/git/refs/heads/{default_branch}", headers=headers)
        if ref_res.status_code != 200:
            return {"success": False, "error": f"Cannot get ref for {default_branch}"}
        
        base_sha = ref_res.json()["object"]["sha"]
        
        # 2. Create the new branch
        create_ref = requests.post(f"{base_url}/git/refs", headers=headers, json={
            "ref": f"refs/heads/{branch_name}",
            "sha": base_sha
        })
        
        if create_ref.status_code not in [200, 201]:
            error_msg = create_ref.json().get("message", "Unknown error")
            if "Reference already exists" in error_msg:
                pass  # Branch already exists, continue
            else:
                return {"success": False, "error": f"Cannot create branch: {error_msg}"}
        
        # 3. Commit each file to the new branch
        committed_files = []
        for file_data in converted_files:
            file_path = file_data["path"]
            content = file_data["content"]
            
            encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")
            
            # Check if file exists to get its SHA
            existing = requests.get(f"{base_url}/contents/{file_path}?ref={branch_name}", headers=headers)
            payload = {
                "message": f"{commit_message}: {file_path}",
                "content": encoded,
                "branch": branch_name
            }
            if existing.status_code == 200 and isinstance(existing.json(), dict):
                payload["sha"] = existing.json().get("sha")
            
            put_res = requests.put(f"{base_url}/contents/{file_path}", headers=headers, json=payload)
            if put_res.status_code in [200, 201]:
                committed_files.append({"path": file_path, "status": "success"})
            else:
                committed_files.append({
                    "path": file_path,
                    "status": "error",
                    "details": put_res.json().get("message", "Unknown")
                })
        
        # 4. Create a Pull Request
        pr_body = f"## 🔄 Automated Code Conversion\n\n"
        pr_body += f"**Conversion performed by Code Renew**\n\n"
        pr_body += f"### Files converted ({len(committed_files)}):\n"
        for f in committed_files:
            status = "✅" if f["status"] == "success" else "❌"
            pr_body += f"- {status} `{f['path']}`\n"
        
        pr_res = requests.post(f"{base_url}/pulls", headers=headers, json={
            "title": commit_message,
            "body": pr_body,
            "head": branch_name,
            "base": default_branch
        })
        
        pr_url = None
        if pr_res.status_code in [200, 201]:
            pr_url = pr_res.json().get("html_url")
        
        return {
            "success": True,
            "branch": branch_name,
            "committed_files": committed_files,
            "pr_url": pr_url,
            "message": f"Created branch '{branch_name}' with {len(committed_files)} file(s)"
                       + (f" and PR: {pr_url}" if pr_url else "")
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def cleanup_clone(repo_path: str):
    """Remove a cloned repository from disk."""
    _safe_rmtree(repo_path)
