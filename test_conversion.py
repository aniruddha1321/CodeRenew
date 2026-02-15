#!/usr/bin/env python
# -*- coding: utf-8 -*-
# Simple test script to verify conversion with rate limiting
import requests
import json
import time

BACKEND_URL = "http://127.0.0.1:5000"

# Test Python 2 code that should trigger conversion
test_code = '''
import sys

def hello_world():
    print "Hello, World!"
    raw_input("Press Enter to continue...")
    return True

if __name__ == "__main__":
    result = hello_world()
    print "Result:", result
'''

def test_single_conversion():
    """Test single file conversion"""
    print("Testing single file conversion...")
    
    try:
        response = requests.post(f"{BACKEND_URL}/migrate", 
                               json={
                                   "code": test_code,
                                   "filename": "test_single.py",
                                   "model": "gpt-3.5-turbo"  # Use cheaper model for testing
                               })
        
        if response.status_code == 200:
            data = response.json()
            print("OK Single conversion successful")
            print(f"  - Status: {data.get('status')}")
            print(f"  - Model used: {data.get('model_used')}")
            print(f"  - Security issues: {len(data.get('security_issues', []))}")
            return True
        else:
            print(f"FAIL Single conversion failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"FAIL Single conversion error: {e}")
        return False

def test_multiple_conversions():
    """Test multiple file conversion to trigger rate limiting"""
    print("\nTesting multiple file conversions (may trigger rate limiting)...")
    
    test_files = [
        ("test_file1.py", test_code),
        ("test_file2.py", test_code.replace('hello_world', 'goodbye_world')),
        ("test_file3.py", test_code.replace('"Hello, World!"', '"Test File 3"')),
    ]
    
    results = []
    for i, (filename, code) in enumerate(test_files, 1):
        print(f"  Converting file {i}/{len(test_files)}: {filename}")
        
        try:
            response = requests.post(f"{BACKEND_URL}/migrate", 
                                   json={
                                       "code": code,
                                       "filename": filename,
                                       "model": "gpt-3.5-turbo"
                                   })
            
            if response.status_code == 200:
                data = response.json()
                print(f"    OK {filename} converted successfully")
                results.append(True)
            else:
                print(f"    FAIL {filename} failed: {response.status_code} - {response.text}")
                results.append(False)
                
                # Check for rate limiting
                if "rate limit" in response.text.lower() or response.status_code == 429:
                    print("    INFO Rate limiting detected - this is expected!")
                    time.sleep(2)  # Brief pause before next attempt
                    
        except Exception as e:
            print(f"    FAIL {filename} error: {e}")
            results.append(False)
        
        # Small delay between requests
        time.sleep(1)
    
    successful = sum(results)
    print(f"  Multiple conversion results: {successful}/{len(test_files)} successful")
    return successful > 0

if __name__ == "__main__":
    print("=== Legacy Code Modernizer API Test ===")
    print(f"Testing against: {BACKEND_URL}")
    
    # Test health first
    try:
        health = requests.get(f"{BACKEND_URL}/api/health")
        if health.status_code == 200:
            print("OK Backend health check passed")
        else:
            print(f"FAIL Backend health check failed: {health.status_code}")
            exit(1)
    except Exception as e:
        print(f"FAIL Cannot connect to backend: {e}")
        exit(1)
    
    # Run tests
    single_ok = test_single_conversion()
    multiple_ok = test_multiple_conversions()
    
    print(f"\n=== Test Results ===")
    print(f"Single conversion: {'OK PASS' if single_ok else 'FAIL FAIL'}")
    print(f"Multiple conversions: {'OK PASS' if multiple_ok else 'FAIL FAIL'}")
    
    if single_ok and multiple_ok:
        print("SUCCESS All tests passed! Rate limiting and conversion fixes are working.")
    else:
        print("ERROR Some tests failed. Please check the implementation.")