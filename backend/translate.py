import os
import sys
import subprocess
import json
import time
from groq import Groq, GroqError
import tempfile
from security_check import ai_security_check

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


def groq_request_with_retry(client, model_name, messages, temperature=None, max_retries=3):
    """
    Make Groq API request with retry logic for rate limiting.
    """
    # Use model-appropriate temperature if not specified
    if temperature is None:
        temperature = get_temperature_for_model(model_name)
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
            )
            return response.choices[0].message.content
        except GroqError as e:
            error_str = str(e)
            
            # Check if it's a rate limit error
            if "rate_limit" in error_str.lower() or "429" in error_str:
                if attempt < max_retries - 1:
                    # Extract wait time from error message or use exponential backoff
                    wait_time = 20  # Default wait time
                    if "Please try again in" in error_str:
                        try:
                            # Extract wait time from error message
                            import re
                            match = re.search(r'try again in (\d+)s', error_str)
                            if match:
                                wait_time = int(match.group(1))
                        except:
                            pass
                    
                    print(f"Rate limit hit, waiting {wait_time} seconds before retry {attempt + 1}/{max_retries}")
                    time.sleep(wait_time)
                    continue
                else:
                    raise RuntimeError(f"Rate limit exceeded after {max_retries} attempts: {error_str}")
            else:
                # Non-rate-limit error, don't retry
                raise RuntimeError(f"Groq request failed: {error_str}")
    
    raise RuntimeError("Max retries exceeded")


def read_code(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_tmp(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def clean_ai_response(response: str) -> str:
    """
    Clean AI response to remove any markdown formatting that might have slipped through.
    This ensures we get only raw Python code.
    """
    if not response:
        return response
    
    # Remove markdown code blocks (```python, ```, etc.)
    import re
    
    # Pattern to match code blocks: ```python\n...code...\n``` or ```\n...code...\n```
    code_block_pattern = r'```(?:python)?\s*\n?(.*?)\n?```'
    
    # Check if the response is wrapped in code blocks
    match = re.search(code_block_pattern, response, re.DOTALL)
    if match:
        # Extract just the code content
        cleaned = match.group(1).strip()
    else:
        # If no code blocks found, just clean up any stray backticks
        cleaned = response.strip()
        # Remove any leading/trailing triple backticks
        cleaned = re.sub(r'^```(?:python)?\s*\n?', '', cleaned)
        cleaned = re.sub(r'\n?```\s*$', '', cleaned)
    
    # Remove any explanatory text that might appear before the code
    # Look for patterns like "Here's the converted code:" or similar
    lines = cleaned.split('\n')
    start_idx = 0
    
    # Skip lines that look like explanatory text until we find actual Python code
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        # If line starts with typical Python keywords/patterns, we found the start
        if (stripped.startswith(('import ', 'from ', 'def ', 'class ', 'if ', 'for ', 'while ', 
                                'try:', 'with ', '#', 'print(', 'return ')) or
            '=' in stripped or stripped.endswith(':')):
            start_idx = i
            break
        # Skip common explanatory phrases
        if any(phrase in stripped.lower() for phrase in [
            'here', 'convert', 'moderniz', 'python', 'code', 'result', 'output'
        ]):
            continue
        else:
            # This looks like actual code, start from here
            start_idx = i
            break
    
    # Rejoin from the detected start point
    cleaned = '\n'.join(lines[start_idx:]).strip()
    
    return cleaned


def ai_migrate(code, model_name=None):
    if model_name is None:
        model_name = MODEL_NAME
    
        
    system_prompt = (
        "You modernize Python 2 code into idiomatic Python 3 with type hints. "
        "CRITICAL: Your response must ONLY contain raw Python code. "
        "DO NOT include markdown code blocks, backticks, or any formatting. "
        "DO NOT include explanations, comments, or text before or after the code."
    )
    user_prompt = (
        "Below is Python 3 code translated from Python 2 using 2to3. "
        "Label all variable types explicitly and add type annotations to all functions and variables. "
        "Remove unnecessary comments, whitespace and unused imports. "
        "Improve the code to make it idiomatic and robust in Python 3.\n\n"
        "IMPORTANT: Respond with ONLY the raw Python code. "
        "DO NOT wrap your response in ```python or ``` or any other markdown formatting. "
        "DO NOT add any explanatory text before or after the code.\n\n"
        f"{code}"
    )
    try:
        client = get_groq_client()
        raw_response = groq_request_with_retry(
            client=client,
            model_name=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        # Clean the response to remove any markdown formatting
        resp = clean_ai_response(raw_response)
        
        # Add a small delay before the next API call to prevent rate limiting
        time.sleep(1)
    except Exception as e:
        raise RuntimeError(f"Groq request failed: {e}") from e
    compare_prompt = (
        "Here are two versions of code. The first is Python 2 and the second is the modernized Python 3 version. "
        "Provide a bullet-point list explaining what changed.\n"
        f"Python2 Code:\n{code}\nPython3 Code:\n{resp}"
    )
    try:
        # Use slightly higher temperature for comparison
        comparison_temp = 0.4
        # Use a different system prompt for explanation generation
        explanation_system_prompt = (
            "You are a helpful assistant that explains Python 2 to Python 3 modernization changes clearly and concisely. "
            "When given Python 2 code and its Python 3 equivalent, provide a bullet-point list of the key modernization changes. "
            "Focus on Python 2 to 3 specific improvements like print statements, string handling, iterator changes, type annotations, etc. "
            "Provide no more than 10 bullet points. Be specific and technical about the Python version differences."
        )
        
        compare = groq_request_with_retry(
            client=client,
            model_name=model_name,
            messages=[
                {"role": "system", "content": explanation_system_prompt},
                {"role": "user", "content": compare_prompt},
            ],
            temperature=comparison_temp
        )
        
        # Add a small delay after explanation generation before security check
        time.sleep(1)
    except Exception as e:
        raise RuntimeError(f"Groq request failed: {e}") from e
    return (resp, compare)


from lib2to3.refactor import RefactoringTool, get_fixers_from_package


def run_2to3(src_path, dst_path):
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with open(src_path, "r", encoding="utf-8") as src_file:
        code = src_file.read()
    
    # Validate that the code is not empty
    if not code.strip():
        raise ValueError("Input code is empty")
    
    # Ensure code ends with newline (required by lib2to3)
    if not code.endswith('\n'):
        code += '\n'
    
    fixer_pkg = "lib2to3.fixes"
    tool = RefactoringTool(get_fixers_from_package(fixer_pkg))
    
    try:
        tree = tool.refactor_string(code, src_path)
        if tree is None:
            raise ValueError("lib2to3 failed to parse the code - it may contain syntax errors")
    except Exception as e:
        raise ValueError(f"lib2to3 parsing error: {str(e)}")
    
    with open(dst_path, "w", encoding="utf-8") as dst_file:
        dst_file.write(str(tree))


def migrate_file(src_path, dst_path, model_name=None):
    run_2to3(src_path, dst_path)
    code3 = read_code(dst_path)
    code3_improved = ai_migrate(code3, model_name)[0]
    write_tmp(dst_path, code3_improved)


def migrate_dir(src_dir, dst_dir):
    os.makedirs(dst_dir, exist_ok=True)
    for fname in os.listdir(src_dir):
        if not fname.endswith(".py"):
            continue
        migrate_file(
            os.path.join(src_dir, fname),
            os.path.join(dst_dir, fname),
        )


def migrate_code_str(code_str, filename="code.py", model_name=None):
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "src.py")
        dst_path = os.path.join(tmpdir, "dst.py")
        
        try:
            # Validate that the code is not empty
            if not code_str.strip():
                raise ValueError("Input code is empty")
            
            # Handle encoding issues - ensure code_str is properly encoded
            try:
                # Try to encode and decode to ensure it's valid UTF-8
                code_str.encode('utf-8').decode('utf-8')
            except UnicodeEncodeError as e:
                raise ValueError(f"Input contains invalid characters that cannot be encoded: {str(e)}")
            except UnicodeDecodeError as e:
                raise ValueError(f"Input encoding error: {str(e)}")
            
            # Ensure code ends with newline (required by lib2to3)
            if not code_str.endswith('\n'):
                code_str += '\n'
            
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(code_str)
            
            # Add error handling for lib2to3 parsing
            try:
                run_2to3(src_path, dst_path)
            except Exception as e:
                raise RuntimeError(f"Failed to parse Python 2 code with lib2to3: {str(e)}")
            
            code3 = read_code(dst_path)
            code3_improved, explanation = ai_migrate(code3, model_name)
            security_issues = ai_security_check(code3_improved, filename, model_name)

            return code3_improved, explanation, security_issues
        except Exception as e:
            raise RuntimeError(f"Migration failed: {str(e)}")


def main():
    src = sys.argv[1]
    if os.path.isfile(src):
        res = migrate_code_str(read_code(src))
        #print(f"Code: \n{res[0]}\nExplain: {res[1]}\nSecurity Issues: {res[2]}")


if __name__ == "__main__":
    main()
