import requests
import json

BACKEND_URL = "http://127.0.0.1:5000"

# Simple test code
test_code = 'print "Hello World"'

def test_conversion():
    try:
        response = requests.post(f"{BACKEND_URL}/migrate", 
                               json={
                                   "code": test_code,
                                   "filename": "test.py",
                                   "model": "gpt-3.5-turbo"
                               })
        
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Conversion Status: {data.get('status')}")
            print(f"Model Used: {data.get('model_used')}")
            print(f"Has Result: {'result' in data}")
            print(f"Has Security Issues: {len(data.get('security_issues', []))} issues")
            return True
        else:
            print(f"Error Response: {response.text}")
            return False
    except Exception as e:
        print(f"Request failed: {e}")
        return False

if __name__ == "__main__":
    print("=== Quick API Test ===")
    success = test_conversion()
    print(f"Result: {'PASS' if success else 'FAIL'}")