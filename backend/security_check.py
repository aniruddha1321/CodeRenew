import os
import sys
import time
import json
import re
import uuid

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

# ---------------------------------------------------------------------------
# Vertex AI initialisation
# The SDK uses Application Default Credentials (ADC) automatically.
# Set GCP_PROJECT and GCP_LOCATION in your .env or Cloud Run environment.
# ---------------------------------------------------------------------------
_GCP_PROJECT  = os.getenv("GCP_PROJECT", "")
_GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
MODEL_NAME    = os.getenv("VERTEX_MODEL", "gemini-1.5-pro")

def _init_vertex():
    if not _GCP_PROJECT:
        raise RuntimeError(
            "GCP_PROJECT environment variable is not set. "
            "Add it to your .env file or Cloud Run service environment."
        )
    vertexai.init(project=_GCP_PROJECT, location=_GCP_LOCATION)

_init_vertex()


def _get_model() -> GenerativeModel:
    return GenerativeModel(MODEL_NAME)


def _generate(system_prompt: str, user_prompt: str, temperature: float = 0.3, max_retries: int = 3) -> str:
    """
    Send a prompt to Gemini via the Vertex AI SDK with simple retry logic.
    Returns the raw text response.
    """
    model = _get_model()
    config = GenerationConfig(temperature=temperature, max_output_tokens=8192)
    messages = [f"SYSTEM: {system_prompt}\n\nUSER: {user_prompt}"]

    for attempt in range(max_retries):
        try:
            response = model.generate_content(messages, generation_config=config)
            return response.text
        except Exception as exc:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"Vertex AI call failed (attempt {attempt + 1}): {exc}. Retrying in {wait}s.")
                time.sleep(wait)
            else:
                raise RuntimeError(f"Vertex AI request failed after {max_retries} attempts: {exc}") from exc


# ---------------------------------------------------------------------------
# Security check
# ---------------------------------------------------------------------------

def _extract_line_number(code: str, flagged_snippet: str) -> int:
    if not flagged_snippet:
        return 0
    lines = code.splitlines()
    for i, line in enumerate(lines, start=1):
        if flagged_snippet.strip()[:40] in line:
            return i
    return 0


def ai_security_check(code: str, filename: str = "code", model_name: str = None, language: str = "python") -> list:
    """
    Analyse code for security vulnerabilities using Vertex AI (Gemini 1.5 Pro).
    Returns a list of security issue dicts compatible with the frontend SecurityIssue interface.
    """
    if language.lower() == "java":
        system_prompt = (
            "You are a senior application security engineer specialising in Java. "
            "Analyse the provided Java source code for security vulnerabilities, bad practices, "
            "and compliance risks. "
            "Return ONLY a valid JSON array — no markdown, no explanation text. "
            "Each element must have exactly these fields: "
            "risk_level (one of high/medium/low), issue_title, description, "
            "flagged_code, recommended_code, suggested_fix, "
            "compliance_category (one of HIPAA/ISO27001/General). "
            "If no issues are found return []."
        )
        user_prompt = f"Analyse this Java code for security issues:\n\n{code}"
    else:
        system_prompt = (
            "You are a senior application security engineer. "
            "Analyse the provided source code for security vulnerabilities, bad practices, "
            "and compliance risks. "
            "Return ONLY a valid JSON array — no markdown, no explanation text. "
            "Each element must have exactly these fields: "
            "risk_level (one of high/medium/low), issue_title, description, "
            "flagged_code, recommended_code, suggested_fix, "
            "compliance_category (one of HIPAA/ISO27001/General). "
            "If no issues are found return []."
        )
        user_prompt = f"Analyse this {language} code for security issues:\n\n{code}"

    try:
        raw = _generate(system_prompt, user_prompt, temperature=0.2)

        # Strip markdown fences if the model added them
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        issues_raw = json.loads(raw)

        severity_map = {"high": "high", "medium": "medium", "low": "low"}
        standard_map = {
            "HIPAA": "HIPAA",
            "ISO27001": "ISO27001",
            "ISO 27001": "ISO27001",
            "General": "General",
            "General Security Issue": "General",
        }

        return [
            {
                "id": str(uuid.uuid4()),
                "file": filename,
                "line": _extract_line_number(code, issue.get("flagged_code", "")),
                "severity": severity_map.get(issue.get("risk_level", "low"), "low"),
                "standard": standard_map.get(issue.get("compliance_category", "General"), "General"),
                "title": issue.get("issue_title", "Security Issue"),
                "description": issue.get("description", ""),
                "recommendation": issue.get("suggested_fix", ""),
                "code": issue.get("flagged_code", ""),
                "recommended_code": issue.get("recommended_code", ""),
            }
            for issue in issues_raw
        ]

    except json.JSONDecodeError as exc:
        print(f"Failed to parse Vertex AI response as JSON: {exc}")
        return []
    except Exception as exc:
        print(f"Unexpected error in security check: {exc}")
        return []


def ai_check(code: str) -> str:
    """Legacy compatibility wrapper — returns raw JSON string."""
    return json.dumps(ai_security_check(code), indent=2)


if __name__ == "__main__":
    sample = """
import mysql.connector
db = mysql.connector.connect(host="localhost", user="root", password="admin123", database="patients")
def get_patient(pid):
    cursor = db.cursor()
    cursor.execute(f"SELECT * FROM patients WHERE id = {pid}")
    return cursor.fetchall()
"""
    print(json.dumps(ai_security_check(sample, "test.py"), indent=2))
