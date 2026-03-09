from flask import Flask, redirect, request, jsonify
from flask_cors import CORS
import requests
from translate import migrate_code_str, convert_code_str
from clone_convert import clone_repo, scan_files, bulk_convert, push_branch, cleanup_clone
from knowledge_graph import build_knowledge_graph
from recovery_loop import (
    start_monitoring, stop_monitoring, get_monitor_status,
    get_monitor_events, get_monitor_issues, trigger_scan,
)
from dotenv import load_dotenv
import os
import time
from api_save import save_api_key, delete_api_key, save_token, delete_token
from datetime import datetime
import base64
import threading

load_dotenv()
app = Flask(__name__)

allowed_origins = os.getenv("FRONTEND_ORIGIN", "http://localhost:8080")

origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
CORS(app, resources={r"/*": {"origins": origins}}, supports_credentials=True)



@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify API connectivity and Groq status"""
    try:
        # Basic health check
        health_status = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "server": "Code Renew API",
            "version": "1.0.0"
        }
        
        # Check if Groq API key is configured
        try:
            from translate import fetch_api_key
            api_key = fetch_api_key("groq")
            if api_key:
                health_status["openai_configured"] = True
            else:
                health_status["openai_configured"] = False
                health_status["warning"] = "Groq API key not configured"
        except Exception as e:
            health_status["openai_configured"] = False
            health_status["warning"] = f"Groq configuration error: {str(e)}"
        
        # Test basic Groq connectivity (optional, commented out to avoid unnecessary API calls)
        # Uncomment if you want to test actual Groq connectivity on each health check
        """
        try:
            if health_status["openai_configured"]:
                from groq import Groq
                client = Groq(api_key=api_key)
                # Simple test request
                response = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": "test"}],
                    max_tokens=1
                )
                health_status["groq_api_status"] = "connected"
        except Exception as e:
            health_status["groq_api_status"] = "error"
            health_status["groq_error"] = str(e)
        """
        
        return jsonify(health_status), 200
        
    except Exception as e:
        error_response = {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }
        return jsonify(error_response), 500
    

@app.route("/api/status", methods=["GET"])
def get_api_status():
    """Get detailed API status including model information"""
    try:
        # Get the current model from query parameter or use default
        current_model = request.args.get('model', 'llama-3.3-70b-versatile')
        
        status = {
            "connected": True,
            "timestamp": datetime.utcnow().isoformat(),
            "models": {
                "available": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
                "current": current_model,
                "default": "llama-3.3-70b-versatile"
            },
            "features": {
                "code_conversion": True,
                "security_scanning": True,
                "github_integration": True
            }
        }
        
        # Check API key availability
        try:
            from translate import fetch_api_key
            api_key = fetch_api_key("groq")
            status["api_key_configured"] = bool(api_key)
        except Exception:
            status["api_key_configured"] = False
            
        return jsonify(status), 200
        
    except Exception as e:
        return jsonify({
            "connected": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500

@app.route("/api/github/health", methods=["GET"])
def get_github_status():
    """Get GitHub connectivity status"""
    try:
        status = {
            "connected": False,
            "timestamp": datetime.utcnow().isoformat(),
            "github_configured": False,
            "error": None
        }
        
        # Check if GitHub token is configured
        try:
            from translate import fetch_api_key
            github_token = fetch_api_key("GitHub")
            if github_token and github_token.strip():
                status["github_configured"] = True
                
                # Test GitHub API connectivity with a simple request
                headers = {
                    "Authorization": f"token {github_token.strip()}",
                    "Accept": "application/vnd.github+json"
                }
                
                # Test with a simple user info request
                test_response = requests.get("https://api.github.com/user", headers=headers, timeout=10)
                if test_response.status_code == 200:
                    status["connected"] = True
                    user_data = test_response.json()
                    status["user"] = {
                        "login": user_data.get("login", "unknown"),
                        "name": user_data.get("name", ""),
                        "type": user_data.get("type", "User")
                    }
                else:
                    status["error"] = f"GitHub API returned status {test_response.status_code}"
            else:
                status["error"] = "No GitHub token configured"
                
        except Exception as e:
            status["error"] = f"GitHub connectivity error: {str(e)}"
            status["github_configured"] = False
            
        return jsonify(status), 200
        
    except Exception as e:
        return jsonify({
            "connected": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
            "github_configured": False
        }), 500


@app.route("/migrate", methods=["POST"])
def migrate():
    code = request.json.get("code")
    filename = request.json.get("filename", "code.py")  # Optional filename
    model = request.json.get("model", "llama-3.3-70b-versatile")  # Optional model selection
    
    if not code:
        return jsonify({"status": "error", "message": "No code given"}), 400
    
    try:
        # migrate_code_str now returns (converted_code, explanation, security_issues)
        result = migrate_code_str(code, filename, model)
        return jsonify({
            "status": "success", 
            "result": result[0],  # converted code
            "explain": result[1],  # explanation
            "security_issues": result[2],  # security issues
            "model_used": model  # return which model was used
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/convert", methods=["POST"])
def convert():
    code = request.json.get("code")
    mode = request.json.get("mode")  # "java2py" or "py2java"
    filename = request.json.get("filename", "code")
    model = request.json.get("model", "llama-3.3-70b-versatile")
    
    if not code:
        return jsonify({"status": "error", "message": "No code given"}), 400
    
    if mode not in ("java2py", "py2java"):
        return jsonify({"status": "error", "message": f"Invalid conversion mode: {mode}"}), 400
    
    try:
        result = convert_code_str(code, mode, filename, model)
        return jsonify({
            "status": "success",
            "result": result[0],  # converted code
            "explain": result[1],  # explanation
            "security_issues": result[2],  # security issues
            "model_used": model,
            "mode": mode
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/save", methods=["POST"])
def api_save():
    provider = request.json.get("provider")
    api = request.json.get("api")
    try:
        save_api_key(provider, api)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    

@app.route("/api/gitsave", methods=["POST"])
def git_save():
    provider = request.json.get("provider")
    token = request.json.get("token")
    try:
        save_token(provider, token)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    


@app.route("/api/delete", methods=["POST"])
def api_delete():
    provider = request.json.get("provider")
    try:
        delete_api_key(provider)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
@app.route("/api/gitdelete", methods=["POST"])
def git_delete():
    provider = request.json.get("provider")
    try:
        delete_token(provider)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/github/commit", methods=["POST", "OPTIONS"])
def github_commit():
    if request.method == "OPTIONS":
        return '', 204

    data = request.get_json()
    from translate import fetch_api_key
    token = fetch_api_key("GitHub")
    repo = data.get("repo")
    files = data.get("files")
    message = data.get("message", "Batch commit of converted files")

    if not all([token, repo, files]) or not isinstance(files, list):
        return jsonify({"error": "Missing or invalid required fields"}), 400

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json"
    }

    branch = "main"
    try:
        repo_info = requests.get(f"https://api.github.com/repos/{repo}", headers=headers)
        if repo_info.status_code == 200:
            branch = repo_info.json().get("default_branch", "main")
    except Exception as e:
        print("Failed to fetch branch info:", e)

    results = []

    for file in files:
        path = file.get("path")
        content = file.get("content")

        if not path or content is None:
            results.append({"path": path, "status": "skipped", "reason": "missing path or content"})
            continue

        get_file_url = f"https://api.github.com/repos/{repo}/contents/{path}"
        sha = None

        try:
            res = requests.get(get_file_url, headers=headers)
            if res.status_code == 200 and isinstance(res.json(), dict):
                sha = res.json().get("sha")
        except Exception as e:
            print(f"Error checking existing file at {path}: {e}")

        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
        payload = {
            "message": message,
            "content": encoded_content,
            "branch": branch
        }
        if sha:
            payload["sha"] = sha

        try:
            put_res = requests.put(get_file_url, headers=headers, json=payload)
            if put_res.status_code in [200, 201]:
                results.append({"path": path, "status": "success"})
            else:
                err = put_res.json()
                results.append({"path": path, "status": "error", "details": err})
        except Exception as e:
            results.append({"path": path, "status": "error", "details": str(e)})

    return jsonify({"status": "done", "results": results})


# ─── Clone & Convert Endpoints ───

@app.route("/github/clone", methods=["POST"])
def github_clone():
    """Clone a repo and scan for code files."""
    data = request.get_json()
    repo_url = data.get("repo_url", "").strip()
    
    if not repo_url:
        return jsonify({"error": "repo_url is required"}), 400
    
    # Get GitHub token for private repo access
    from translate import fetch_api_key
    token = fetch_api_key("GitHub")
    
    # Clone the repo
    clone_result = clone_repo(repo_url, token)
    if not clone_result.get("success"):
        return jsonify({"error": clone_result.get("error", "Clone failed")}), 400
    
    repo_path = clone_result["repo_path"]
    
    # Scan for code files
    scan_result = scan_files(repo_path)
    
    return jsonify({
        "success": True,
        "repo_name": clone_result["repo_name"],
        "repo_path": repo_path,
        "default_branch": clone_result.get("default_branch", "main"),
        "files": scan_result["files"],
        "total_files": scan_result["total"],
        "python_count": scan_result["python_count"],
        "java_count": scan_result["java_count"]
    })


@app.route("/github/bulk-convert", methods=["POST"])
def github_bulk_convert():
    """Bulk convert selected files from a cloned repo."""
    data = request.get_json()
    repo_path = data.get("repo_path")
    file_paths = data.get("file_paths", [])
    mode = data.get("mode", "py2to3")
    model = data.get("model")
    
    if not repo_path or not file_paths:
        return jsonify({"error": "repo_path and file_paths are required"}), 400
    
    if not os.path.exists(repo_path):
        return jsonify({"error": "Cloned repo not found. Please clone again."}), 404
    
    result = bulk_convert(repo_path, file_paths, mode, model)
    return jsonify(result)


@app.route("/github/push-branch", methods=["POST"])
def github_push_branch():
    """Push converted files to a new branch and create a PR."""
    data = request.get_json()
    repo_name = data.get("repo_name", "")
    branch_name = data.get("branch_name", "modernized-code")
    converted_files = data.get("converted_files", [])
    commit_message = data.get("commit_message", "Automated code conversion by Code Renew")
    
    if not repo_name or not converted_files:
        return jsonify({"error": "repo_name and converted_files are required"}), 400
    
    from translate import fetch_api_key
    token = fetch_api_key("GitHub")
    
    if not token:
        return jsonify({"error": "GitHub token not configured. Please add it in Settings."}), 401
    
    result = push_branch(repo_name, branch_name, converted_files, commit_message, token)
    return jsonify(result)


# ─── Knowledge Graph Endpoint ───

@app.route("/analyze/knowledge-graph", methods=["POST"])
def analyze_knowledge_graph():
    """Build a knowledge graph from a cloned repository."""
    data = request.get_json()
    repo_path = data.get("repo_path")
    
    if not repo_path or not os.path.exists(repo_path):
        return jsonify({"error": "Valid repo_path is required. Clone the repo first."}), 400
    
    try:
        graph_data = build_knowledge_graph(repo_path)
        return jsonify({
            "success": True,
            **graph_data
        })
    except Exception as e:
        return jsonify({"error": f"Knowledge graph generation failed: {str(e)}"}), 500


# ─── Recovery Loop Endpoints ───

@app.route("/recovery/start", methods=["POST"])
def recovery_start():
    """Start monitoring a GitHub repository for issues."""
    data = request.get_json()
    repo_url = data.get("repo_url", "").strip()

    if not repo_url:
        return jsonify({"error": "repo_url is required"}), 400

    poll_interval = data.get("poll_interval", 300)
    model = data.get("model")
    auto_fix = data.get("auto_fix", True)

    result = start_monitoring(repo_url, poll_interval, model, auto_fix)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 400


@app.route("/recovery/stop", methods=["POST"])
def recovery_stop():
    """Stop monitoring a repository."""
    data = request.get_json()
    monitor_id = data.get("monitor_id", "").strip()

    if not monitor_id:
        return jsonify({"error": "monitor_id is required"}), 400

    result = stop_monitoring(monitor_id)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/recovery/status", methods=["GET"])
def recovery_status():
    """Get status of monitored repositories."""
    monitor_id = request.args.get("monitor_id")
    result = get_monitor_status(monitor_id)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/recovery/events", methods=["GET"])
def recovery_events():
    """Get the event log for a monitor."""
    monitor_id = request.args.get("monitor_id", "").strip()
    limit = request.args.get("limit", 50, type=int)

    if not monitor_id:
        return jsonify({"error": "monitor_id query param is required"}), 400

    result = get_monitor_events(monitor_id, limit)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/recovery/scan", methods=["POST"])
def recovery_scan_now():
    """Trigger an immediate scan for a monitored repo."""
    data = request.get_json()
    monitor_id = data.get("monitor_id", "").strip()

    if not monitor_id:
        return jsonify({"error": "monitor_id is required"}), 400

    result = trigger_scan(monitor_id)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/recovery/issues", methods=["GET"])
def recovery_issues():
    """Get detailed issues from the latest scan for a monitor."""
    monitor_id = request.args.get("monitor_id", "").strip()

    if not monitor_id:
        return jsonify({"error": "monitor_id query param is required"}), 400

    result = get_monitor_issues(monitor_id)
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404


if __name__ == "__main__":
    app.run(port=5000)