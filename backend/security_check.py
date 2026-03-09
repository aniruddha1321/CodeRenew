import os
import sys
import subprocess
import time
from groq import Groq, GroqError
import tempfile
import json
import re
import uuid

# Ensure UTF-8 encoding for subprocess calls
os.environ['PYTHONIOENCODING'] = 'utf-8'

# Build absolute path to api_manager executable based on this script's location
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_API_MANAGER = os.path.join(_SCRIPT_DIR, "api_manager", "target", "release", "api_manager.exe")


def fetch_api_key(provider: str) -> str:
    cmd = [_API_MANAGER, "-g", provider]
    try:
        # Use utf-8 encoding and handle errors gracefully
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            encoding='utf-8', 
            errors='replace',  # Replace invalid characters instead of failing
            check=True
        )
    except subprocess.CalledProcessError as e:
        stderr = e.stderr or ""
        raise RuntimeError(
            f"Fail to run api_manager, provider={provider}, stderr: {stderr}"
        ) from e

    try:
        # The stdout should now be properly decoded UTF-8
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"api_manager return incorrect json format: {result.stdout}, error: {str(e)}")
    
    if data.get("provider") == provider and data.get("status") == "success":
        key = data.get("key")
        if key and key.strip():  # Check for non-empty key
            return key
        else:
            return ""  # Return empty string if no key found

    raise RuntimeError(
        f"Failed to fetch API key for {provider}, output: {result.stdout}"
    )


MODEL_NAME = "llama-3.3-70b-versatile"

def get_temperature_for_model(model_name: str) -> float:
    """Get the appropriate temperature setting for the given model."""
    return 0.3  # Groq models work well with low temperature for code tasks

def get_groq_client():
    """Get Groq client instance, creating it lazily when needed."""
    try:
        api_key = fetch_api_key("groq")
        if not api_key:
            raise RuntimeError("No Groq API key configured")
        return Groq(api_key=api_key)
    except Exception as e:
        raise RuntimeError(f"Failed to initialize Groq client: {str(e)}")


def extract_line_number(code: str, flagged_code: str) -> int:
    """Extract the line number where the flagged code appears."""
    if not flagged_code or not flagged_code.strip():
        return 1
    
    lines = code.split('\n')
    flagged_lines = flagged_code.strip().split('\n')
    
    # If it's a single line, try to find exact match first, then partial
    if len(flagged_lines) == 1:
        flagged_line = flagged_lines[0].strip()
        
        # Try exact match first
        for i, line in enumerate(lines, 1):
            if line.strip() == flagged_line:
                return i
                
        # Try partial match if no exact match
        for i, line in enumerate(lines, 1):
            if flagged_line in line.strip():
                return i
    else:
        # For multiline flagged code, look for the first line
        first_flagged_line = flagged_lines[0].strip()
        if first_flagged_line:
            for i, line in enumerate(lines, 1):
                if first_flagged_line in line.strip():
                    return i
    
    return 1  # Default to line 1 if not found


def ai_security_check(code: str, filename: str = "code.py", model_name: str = None, language: str = "python") -> list:
    """
    Perform AI-powered security analysis on code.
    Supports both Python and Java code analysis.
    Returns a list of security issues in the required format.
    """
    if model_name is None:
        model_name = MODEL_NAME
    
    if language == "java":
        system_prompt = """
You are a security auditing assistant integrated into a desktop application called *Code Renew*.
Your task is to analyze Java source code and identify any *security vulnerabilities, bad practices, or compliance risks*, then classify them and suggest improvements.

### Requirements
Please scan the provided Java code and return a list of all identified issues, using the structured output format below.
For *each issue*, include the following fields:
- *risk_level*: One of "high", "medium", or "low" (lowercase)
- *issue_title*: A 2-4 word summary of the issue (e.g., "SQL Injection Risk", "Insecure Deserialization")
- *description*: One sentence describing the issue and why it matters
- *flagged_code*: The exact line(s) or snippet that triggered the issue
- *recommended_code*: The corrected/secure version of the flagged_code that should replace it
- *suggested_fix*: A clear recommendation for modern, secure Java code
- *compliance_category*: Must be exactly one of: "HIPAA", "ISO27001", or "General"

### What to Look For

#### General Security Issues
- SQL injection via JDBC (string concatenation in queries)
- Insecure deserialization (ObjectInputStream without validation)
- Missing null checks leading to NullPointerException
- Hardcoded secrets, passwords, or API keys
- Weak exception handling that exposes stack traces
- Missing input validation or sanitation
- Unsecured file or network access
- Use of deprecated or insecure APIs
- Command injection risks (Runtime.exec with user input)
- Path traversal vulnerabilities
- Insecure random number generation (java.util.Random vs SecureRandom)
- Missing authentication or authorization checks
- XML External Entity (XXE) vulnerabilities
- Cross-site scripting (XSS) in web contexts
- Improper resource management (unclosed streams/connections)

#### HIPAA-Specific Risks
- Exposure of PHI (e.g., names, health records, account IDs)
- Logging PHI or storing it unencrypted
- Lack of access control or audit logs for sensitive data
- Missing encryption for storage or transmission of health data

#### ISO 27001-Specific Risks
- Hardcoded secrets (violates control A.9.2, A.10.1)
- No traceability or audit logging (A.12.4)
- Use of insecure libraries without validation
- Lack of authentication or access control
- Missing input validation (A.14.2)
- Weak cryptography (A.10.1)

### Output Format (return in JSON)
Return ONLY a valid JSON array. Do not include any markdown formatting or additional text.
[
  {
    "risk_level": "high",
    "issue_title": "SQL Injection Risk",
    "description": "User input is directly concatenated into SQL query, allowing SQL injection attacks.",
    "flagged_code": "String query = \"SELECT * FROM users WHERE id = \" + userId;",
    "recommended_code": "PreparedStatement stmt = conn.prepareStatement(\"SELECT * FROM users WHERE id = ?\"); stmt.setString(1, userId);",
    "suggested_fix": "Use PreparedStatement with parameterized queries to prevent SQL injection.",
    "compliance_category": "General"
  }
]

### Guidelines
- If no issues are found, return an *empty array*: []
- Analyze *both syntax and semantic meaning* of the code
- Return *specific, actionable recommendations*
- Focus on real security issues, not style preferences
- Be thorough but avoid false positives
"""
        user_message = f"Analyze this Java code for security issues:\n\n{code}"
    else:
        system_prompt = """
You are a security auditing assistant integrated into a desktop application called *Code Renew*.
Your task is to analyze Python source code and identify any *security vulnerabilities, bad practices, or compliance risks*, then classify them and suggest improvements.

### Requirements
Please scan the provided Python code and return a list of all identified issues, using the structured output format below.
For *each issue*, include the following fields:
- *risk_level*: One of "high", "medium", or "low" (lowercase)
- *issue_title*: A 2-4 word summary of the issue (e.g., "Unvalidated Input", "SQL Injection Risk")
- *description*: One sentence describing the issue and why it matters
- *flagged_code*: The exact line(s) or snippet that triggered the issue
- *recommended_code*: The corrected/secure version of the flagged_code that should replace it
- *suggested_fix*: A clear recommendation for modern, secure Python (v3) code
- *compliance_category*: Must be exactly one of: "HIPAA", "ISO27001", or "General"

### What to Look For

#### General Security Issues
- Use of insecure functions (eval, exec, input() in Python 2)
- Missing input validation or sanitation
- Hardcoded secrets, passwords, or API keys
- Unsecured file or network access
- Use of deprecated or outdated libraries
- Weak exception handling that exposes internals
- Logging sensitive information without safeguards
- Poor cryptographic practices or key management
- SQL injection vulnerabilities
- Command injection risks
- Path traversal vulnerabilities
- Insecure random number generation
- Missing authentication or authorization checks

#### HIPAA-Specific Risks
- Exposure of PHI (e.g., names, health records, account IDs)
- Logging PHI or storing it unencrypted
- Lack of access control or audit logs for sensitive data
- Missing encryption for storage or transmission of health data
- Insufficient data retention policies
- Missing data integrity checks

#### ISO 27001-Specific Risks
- Hardcoded secrets (violates control A.9.2, A.10.1)
- No traceability or audit logging (A.12.4)
- Use of insecure libraries without validation
- Lack of authentication or access control
- Poor separation of concerns or privilege escalation risks
- Missing input validation (A.14.2)
- Weak cryptography (A.10.1)
- No error handling strategy (A.12.1)

### Output Format (return in JSON)
Return ONLY a valid JSON array. Do not include any markdown formatting or additional text.
[
  {
    "risk_level": "high",
    "issue_title": "Hardcoded Password",
    "description": "The script contains a hardcoded password, which poses a serious risk if committed or shared.",
    "flagged_code": "password = 'mysecret123'",
    "recommended_code": "password = os.getenv('PASSWORD')",
    "suggested_fix": "Store the password in an environment variable or a secure secrets manager.",
    "compliance_category": "ISO27001"
  }
]

### Guidelines
- If no issues are found, return an *empty array*: []
- Analyze *both syntax and semantic meaning* of the code
- Return *specific, actionable recommendations*
- Focus on real security issues, not style preferences
- Be thorough but avoid false positives
"""
        user_message = f"Analyze this Python code for security issues:\n\n{code}"

    try:
        client = get_groq_client()
        effective_model = model_name if model_name else MODEL_NAME
        
        # Import retry function from translate module
        try:
            from translate import groq_request_with_retry
            content = groq_request_with_retry(
                client=client,
                model_name=effective_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ]
            )
        except ImportError:
            # Fallback to direct call if import fails
            temperature = get_temperature_for_model(effective_model)
            resp = client.chat.completions.create(
                model=effective_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=temperature,
            )
            content = resp.choices[0].message.content
        
        # Parse the JSON response
        try:
            # Clean up the response if it contains markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            issues = json.loads(content)
            
            # Transform the AI response to match our SecurityIssue interface
            security_issues = []
            for issue in issues:
                # Map risk_level to severity
                severity_map = {
                    "high": "high",
                    "medium": "medium", 
                    "low": "low"
                }
                
                # Map compliance_category to standard
                standard_map = {
                    "HIPAA": "HIPAA",
                    "ISO27001": "ISO27001",
                    "General": "General",
                    "ISO 27001": "ISO27001",  # Handle variations
                    "General Security Issue": "General"
                }
                
                security_issue = {
                    "id": str(uuid.uuid4()),
                    "file": filename,
                    "line": extract_line_number(code, issue.get("flagged_code", "")),
                    "severity": severity_map.get(issue.get("risk_level", "low"), "low"),
                    "standard": standard_map.get(issue.get("compliance_category", "General"), "General"),
                    "title": issue.get("issue_title", "Security Issue"),
                    "description": issue.get("description", ""),
                    "recommendation": issue.get("suggested_fix", ""),
                    "code": issue.get("flagged_code", ""),
                    "recommended_code": issue.get("recommended_code", "")
                }
                security_issues.append(security_issue)
            
            return security_issues
            
        except json.JSONDecodeError as e:
            print(f"Failed to parse AI response as JSON: {e}")
            print(f"Response was: {content}")
            return []
            
    except GroqError as e:
        print(f"Groq request failed: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error in security check: {e}")
        return []


def ai_check(code: str) -> str:
    """Legacy function for compatibility - returns raw JSON string."""
    issues = ai_security_check(code)
    return json.dumps(issues, indent=2)


def main():
    test_code = """
import mysql.connector
import os

# Database connection with hardcoded password
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="admin123",  # Hardcoded password
    database="patients"
)

def get_patient_data(patient_id):
    cursor = db.cursor()
    # SQL injection vulnerability
    query = f"SELECT * FROM patients WHERE id = {patient_id}"
    cursor.execute(query)
    return cursor.fetchall()

def save_patient_file(content, filename):
    # Path traversal vulnerability
    with open(f"/var/medical_records/{filename}", "w") as f:
        f.write(content)

def log_access(user_id, patient_data):
    # Logging sensitive data
    print(f"User {user_id} accessed patient data: {patient_data}")

def generate_session_id():
    # Weak random number generation
    import random
    return random.randint(1000, 9999)

# Using eval - dangerous
user_input = input("Enter calculation: ")
result = eval(user_input)
print(result)
"""
    
    issues = ai_security_check(test_code, "test.py")
    print(json.dumps(issues, indent=2))


if __name__ == "__main__":
    main()