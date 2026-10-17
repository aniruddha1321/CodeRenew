"""
translate.py — AI-powered code conversion using Vertex AI (Gemini 1.5 Pro).
All inference is done via google-cloud-aiplatform with Application Default Credentials.
No third-party API keys are required.
"""

import os
import sys
import time
import re

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

from security_check import ai_security_check

# ---------------------------------------------------------------------------
# Vertex AI initialisation
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
    Call Gemini via Vertex AI with retry logic.
    Returns the raw text response.
    """
    model = _get_model()
    config = GenerationConfig(temperature=temperature, max_output_tokens=8192)
    combined = f"SYSTEM: {system_prompt}\n\nUSER: {user_prompt}"

    for attempt in range(max_retries):
        try:
            response = model.generate_content(combined, generation_config=config)
            return response.text
        except Exception as exc:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"Vertex AI call failed (attempt {attempt + 1}): {exc}. Retrying in {wait}s.")
                time.sleep(wait)
            else:
                raise RuntimeError(
                    f"Vertex AI request failed after {max_retries} attempts: {exc}"
                ) from exc


# ---------------------------------------------------------------------------
# Response cleaning
# ---------------------------------------------------------------------------

def clean_ai_response(response: str, language: str = "python") -> str:
    """Strip markdown code fences from AI response."""
    if not response:
        return response
    response = response.strip()
    patterns = [
        rf"```{re.escape(language)}\n?(.*?)```",
        r"```\w*\n?(.*?)```",
    ]
    for pattern in patterns:
        match = re.search(pattern, response, re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return response


def read_code(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Migration (legacy modernisation)
# ---------------------------------------------------------------------------

def migrate_code_str(code: str) -> tuple:
    """
    Modernise legacy Python 2 code to idiomatic Python 3.
    Returns (modernised_code, explanation, security_issues).
    """
    system_prompt = (
        "You modernise legacy Python 2 code to idiomatic Python 3. "
        "CRITICAL: Your response must contain ONLY raw Python code. "
        "Do NOT include markdown fences, backticks, or any text before or after the code."
    )
    user_prompt = (
        "Modernise the following legacy Python code to Python 3. "
        "Fix deprecated APIs, use f-strings, pathlib, type hints, and modern idioms. "
        "IMPORTANT: Respond with ONLY the raw Python code.\n\n"
        f"{code}"
    )

    resp = clean_ai_response(_generate(system_prompt, user_prompt), "python")

    explanation = _generate(
        "You explain Python 2 to Python 3 migration changes concisely in bullet points. "
        "Provide no more than 10 specific, technical bullet points.",
        f"Python 2:\n{code}\n\nPython 3:\n{resp}",
        temperature=0.4,
    )

    security_issues = ai_security_check(resp, "migrated_code.py")
    return resp, explanation, security_issues


# ---------------------------------------------------------------------------
# Specialised conversions
# ---------------------------------------------------------------------------

def ai_convert_java_to_python(code: str, model_name: str = None) -> tuple:
    """Convert Java code to idiomatic Python 3."""
    system_prompt = (
        "You convert Java code to idiomatic Python 3. "
        "CRITICAL: Your response must contain ONLY raw Python code. "
        "Do NOT include markdown fences, backticks, or explanatory text."
    )
    user_prompt = (
        "Convert the following Java code to idiomatic Python 3. "
        "Use snake_case, list comprehensions, dataclasses where appropriate, "
        "and remove Java-specific boilerplate. "
        "IMPORTANT: Respond with ONLY the raw Python code.\n\n"
        f"{code}"
    )

    resp = clean_ai_response(_generate(system_prompt, user_prompt), "python")

    explanation = _generate(
        "You explain Java to Python conversion changes concisely in bullet points. "
        "Provide no more than 10 specific, technical bullet points.",
        f"Java:\n{code}\n\nPython:\n{resp}",
        temperature=0.4,
    )
    return resp, explanation


def ai_convert_python_to_java(code: str, model_name: str = None) -> tuple:
    """Convert Python code to idiomatic Java."""
    system_prompt = (
        "You convert Python code to idiomatic Java. "
        "CRITICAL: Your response must contain ONLY raw Java code. "
        "Do NOT include markdown fences, backticks, or explanatory text."
    )
    user_prompt = (
        "Convert the following Python code to idiomatic Java. "
        "Use proper class structure, access modifiers, strong typing, "
        "camelCase naming, and Javadoc comments. "
        "Map Python types: list->ArrayList, dict->HashMap. "
        "IMPORTANT: Respond with ONLY the raw Java code.\n\n"
        f"{code}"
    )

    resp = clean_ai_response(_generate(system_prompt, user_prompt), "java")

    explanation = _generate(
        "You explain Python to Java conversion changes concisely in bullet points. "
        "Provide no more than 10 specific, technical bullet points.",
        f"Python:\n{code}\n\nJava:\n{resp}",
        temperature=0.4,
    )
    return resp, explanation


def ai_convert_generic(code: str, source_lang: str, target_lang: str, model_name: str = None) -> tuple:
    """Generic AI-powered code conversion between any two supported languages."""
    output_lang_tag = "python" if "python" in target_lang.lower() else target_lang.lower()

    system_prompt = (
        f"You convert {source_lang} code to idiomatic {target_lang} code. "
        "CRITICAL: Your response must contain ONLY raw code. "
        "Do NOT include markdown fences, backticks, or explanatory text."
    )
    user_prompt = (
        f"Convert the following {source_lang} code to idiomatic {target_lang}. "
        f"Use {target_lang} best practices and conventions. "
        "IMPORTANT: Respond with ONLY the raw code.\n\n"
        f"{code}"
    )

    resp = clean_ai_response(_generate(system_prompt, user_prompt), output_lang_tag)

    explanation = _generate(
        f"You explain {source_lang} to {target_lang} conversion changes concisely in bullet points. "
        "Provide no more than 10 specific, technical bullet points.",
        f"{source_lang}:\n{code}\n\n{target_lang}:\n{resp}",
        temperature=0.4,
    )
    return resp, explanation


# ---------------------------------------------------------------------------
# Conversion mode dispatch
# ---------------------------------------------------------------------------

CONVERSION_MODES = {
    "java2py": ("Java",       "Python",     "python"),
    "py2java": ("Python",     "Java",       "java"),
    "cpp2py":  ("C++",        "Python",     "python"),
    "js2py":   ("JavaScript", "Python",     "python"),
    "ts2py":   ("TypeScript", "Python",     "python"),
    "cs2py":   ("C#",         "Python",     "python"),
    "rb2py":   ("Ruby",       "Python",     "python"),
}


def convert_code_str(code_str: str, mode: str, filename: str = "code", model_name: str = None) -> tuple:
    """
    Convert code between languages based on the specified mode.
    Returns (converted_code, explanation, security_issues).
    """
    if not code_str.strip():
        raise ValueError("Input code is empty")

    try:
        code_str.encode("utf-8").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"Input encoding error: {exc}")

    try:
        if mode == "java2py":
            converted, explanation = ai_convert_java_to_python(code_str)
            security = ai_security_check(converted, filename, language="python")
            return converted, explanation, security
        elif mode == "py2java":
            converted, explanation = ai_convert_python_to_java(code_str)
            security = ai_security_check(converted, filename, language="java")
            return converted, explanation, security
        elif mode in CONVERSION_MODES:
            source_lang, target_lang, sec_lang = CONVERSION_MODES[mode]
            converted, explanation = ai_convert_generic(code_str, source_lang, target_lang)
            security = ai_security_check(converted, filename, language=sec_lang)
            return converted, explanation, security
        else:
            raise ValueError(f"Unsupported conversion mode: {mode}")
    except Exception as exc:
        raise RuntimeError(f"Conversion failed: {exc}") from exc


def main():
    if len(sys.argv) > 1:
        src = sys.argv[1]
        if os.path.isfile(src):
            result = migrate_code_str(read_code(src))
            print(result)


if __name__ == "__main__":
    main()
